use crate::model::{parse_progress, Progress};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
    sync::watch,
};

pub const CANCELLED: &str = "Cancelled.";

pub fn engine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("engines");
    for name in ["yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe", "deno.exe"] {
        if !root.join(name).is_file() {
            return Err("The download tools are missing. Reinstall ytnabber or run npm run engines:prepare when developing.".into());
        }
    }
    Ok(root)
}

pub fn base_args(root: &Path) -> Vec<String> {
    vec![
        "--ignore-config".into(),
        "--no-plugin-dirs".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--no-color".into(),
        "--encoding".into(),
        "utf-8".into(),
        "--windows-filenames".into(),
        "--no-js-runtimes".into(),
        "--js-runtimes".into(),
        format!("deno:{}", root.join("deno.exe").display()),
        "--ffmpeg-location".into(),
        root.to_string_lossy().into_owned(),
        "--socket-timeout".into(),
        "20".into(),
        "--retries".into(),
        "2".into(),
        "--extractor-retries".into(),
        "2".into(),
    ]
}

#[cfg(windows)]
struct ProcessTree(isize);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &tokio::process::Child) -> Result<Self, String> {
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            );
            let assigned = child
                .raw_handle()
                .is_some_and(|process| AssignProcessToJobObject(job, process as _) != 0);
            if set == 0 || !assigned {
                let error = std::io::Error::last_os_error().to_string();
                CloseHandle(job);
                return Err(error);
            }
            Ok(Self(job as isize))
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}

fn emit_processing(emit: &impl Fn(Progress), request_id: u64) {
    emit(Progress {
        request_id,
        phase: "processing".into(),
        percent: None,
        speed: None,
        downloaded: None,
        total: None,
    });
}

pub async fn run(
    root: &Path,
    args: Vec<String>,
    mut cancel: watch::Receiver<bool>,
    request_id: u64,
    metadata: bool,
    emit: impl Fn(Progress) + Send + Sync + Clone + 'static,
) -> Result<String, String> {
    if *cancel.borrow() {
        return Err(CANCELLED.into());
    }
    let mut command = Command::new(root.join("yt-dlp.exe"));
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the download tools: {e}"))?;
    #[cfg(windows)]
    let tree = ProcessTree::attach(&child)?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Could not read the download process.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Could not read process errors.")?;
    let err_emit = emit.clone();
    let mut err_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut tail = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(progress) = parse_progress(&line, request_id) {
                err_emit(progress);
                continue;
            }
            if line.starts_with("__POST__")
                || line.starts_with("[Merger]")
                || line.starts_with("[ExtractAudio]")
                || line.starts_with("[VideoRemuxer]")
            {
                emit_processing(&err_emit, request_id);
                continue;
            }
            tail.push(line);
            if tail.len() > 12 {
                tail.remove(0);
            }
        }
        tail.join("\n")
    });
    let output = async {
        let mut result = String::new();
        if metadata {
            let mut reader = BufReader::new(stdout).take(32 * 1024 * 1024);
            reader
                .read_to_string(&mut result)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            let mut lines = BufReader::new(stdout).lines();
            while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
                if let Some(progress) = parse_progress(&line, request_id) {
                    emit(progress);
                } else if line.starts_with("__POST__")
                    || line.starts_with("[Merger]")
                    || line.starts_with("[ExtractAudio]")
                    || line.starts_with("[VideoRemuxer]")
                {
                    emit_processing(&emit, request_id);
                } else if let Some(file) = line.strip_prefix("__FILE__") {
                    result = file.to_owned();
                }
            }
        }
        let status = child.wait().await.map_err(|e| e.to_string())?;
        Ok::<_, String>((status, result))
    };
    // Metadata gets a fixed deadline; downloads allow slow transfers and conversion.
    let timeout = if metadata {
        Duration::from_secs(120)
    } else {
        Duration::from_secs(24 * 60 * 60)
    };
    let outcome = tokio::select! {
        _ = cancel.changed() => Err(CANCELLED.to_owned()),
        _ = tokio::time::sleep(timeout) => Err("The source timed out. Check your connection and try again.".to_owned()),
        result = output => result,
    };
    #[cfg(windows)]
    drop(tree);
    if outcome.is_err() {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    let errors = match tokio::time::timeout(Duration::from_secs(3), &mut err_task).await {
        Ok(Ok(tail)) => tail,
        _ => {
            err_task.abort();
            String::new()
        }
    };
    let (status, result) = outcome?;
    if !status.success() {
        return Err(if errors.is_empty() {
            "The download engine stopped unexpectedly. Try another public video URL.".into()
        } else {
            errors.chars().take(2400).collect()
        });
    }
    Ok(result)
}

pub fn download_args(
    root: &Path,
    format: crate::model::Format,
    height: Option<u32>,
    staging: &Path,
    url: &str,
) -> Vec<String> {
    let mut args = base_args(root);
    args.extend(crate::model::format_args(format, height));
    args.extend([
        "--no-overwrites".into(),
        "--no-continue".into(),
        "--no-simulate".into(),
        "--newline".into(),
        "--progress".into(),
        "--progress-delta".into(),
        "0.3".into(),
        "--progress-template".into(),
        "download:__PROGRESS__%(progress)j".into(),
        "--progress-template".into(),
        "postprocess:__POST__%(progress)j".into(),
        "--print".into(),
        "after_move:__FILE__%(filepath)s".into(),
        "--paths".into(),
        staging.to_string_lossy().into_owned(),
        "-o".into(),
        "%(title).150B [%(id)s].%(ext)s".into(),
        "--".into(),
        url.to_owned(),
    ]);
    args
}
