#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod engine;
mod failure;
mod media;
mod model;
#[cfg(test)]
mod smoke;
mod updater;

use failure::Failure;
use model::{Format, Media, Selection};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, AtomicU8, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::watch;

#[derive(Default)]
struct AppState {
    jobs: Mutex<HashMap<String, (u64, watch::Sender<bool>)>>,
    selection: Mutex<Option<Selection>>,
    folder: Mutex<PathBuf>,
    last_file: Mutex<Option<PathBuf>>,
    latest_metadata: AtomicU64,
    retry_at: Mutex<Option<std::time::Instant>>,
    recovery: Mutex<Option<(model::DownloadKey, PathBuf)>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Startup {
    folder: String,
    engines_ready: bool,
    engine_error: Option<String>,
}

fn begin(state: &AppState, kind: &str, id: u64) -> Result<watch::Receiver<bool>, String> {
    if let Some(until) = state
        .retry_at
        .lock()
        .unwrap()
        .filter(|_| kind != "engine-update")
    {
        let seconds = until
            .saturating_duration_since(std::time::Instant::now())
            .as_secs();
        if seconds > 0 {
            return Err(format!("HTTP Error 429. Retry-After: {}", seconds + 1));
        }
    }
    let mut jobs = state.jobs.lock().unwrap();
    if jobs.contains_key("engine-update") || (kind == "engine-update" && !jobs.is_empty()) {
        return Err("Wait for the current operation to finish before updating the engine.".into());
    }
    if kind == "metadata" {
        if id < state.latest_metadata.load(Ordering::SeqCst) {
            return Err(engine::CANCELLED.into());
        }
        state.latest_metadata.store(id, Ordering::SeqCst);
        *state.selection.lock().unwrap() = None;
    }
    if kind == "download" && jobs.contains_key(kind) {
        return Err("A download is already running.".into());
    }
    if let Some((_, old)) = jobs.remove(kind) {
        let _ = old.send(true);
    }
    let (sender, receiver) = watch::channel(false);
    jobs.insert(kind.into(), (id, sender));
    Ok(receiver)
}
fn finish(state: &AppState, kind: &str, id: u64) {
    let mut jobs = state.jobs.lock().unwrap();
    if jobs.get(kind).is_some_and(|(job_id, _)| *job_id == id) {
        jobs.remove(kind);
    }
}
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("destination.json"))
}

#[tauri::command]
async fn startup(app: AppHandle, state: State<'_, AppState>) -> Result<Startup, String> {
    let default = app
        .path()
        .download_dir()
        .map_err(|_| "Windows Downloads folder could not be found.")?;
    let saved = settings_path(&app)
        .ok()
        .and_then(|p| fs::read(p).ok())
        .and_then(|v| serde_json::from_slice::<PathBuf>(&v).ok())
        .filter(|p| p.is_absolute() && p.is_dir());
    let folder = saved.unwrap_or(default);
    *state.folder.lock().unwrap() = folder.clone();
    let error = match engine::engine_dir(&app) {
        Err(error) => Some(error),
        Ok(root) => {
            let (_sender, cancel) = watch::channel(false);
            engine::tool(&root, "deno.exe", vec!["eval".into(), "--no-config".into(), "const [a,b]=Deno.version.deno.split('.').map(Number); if(a<2||(a===2&&b<3))throw Error('Deno 2.3+ is required'); if(JSON.stringify([1,2].map(x=>x+1))!=='[2,3]')throw Error('JavaScript runtime failed');".into()], cancel).await.err()
        }
    };
    Ok(Startup {
        folder: folder.to_string_lossy().into_owned(),
        engines_ready: error.is_none(),
        engine_error: error,
    })
}

#[tauri::command]
async fn inspect_media(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    request_id: u64,
) -> Result<Media, Failure> {
    let url = model::validate_url(&url)?;
    let root = engine::engine_dir(&app)?;
    let executable = updater::executable(&app, &root)?;
    let cancel = begin(&state, "metadata", request_id)?;
    let mut args = engine::base_args(&root);
    args.extend([
        "--dump-single-json".into(),
        "--skip-download".into(),
        "--".into(),
        url.clone(),
    ]);
    let events = app.clone();
    let result = engine::run_process(
        executable,
        args,
        cancel,
        request_id,
        true,
        move |progress| {
            let _ = events.emit("download-progress", progress);
        },
    )
    .await
    .and_then(|raw| model::parse_media(&raw, request_id));
    let jobs = state.jobs.lock().unwrap();
    if state.latest_metadata.load(Ordering::SeqCst) == request_id {
        if let Ok(media) = &result {
            *state.selection.lock().unwrap() = Some(Selection {
                url,
                media: media.clone(),
            });
        }
    }
    drop(jobs);
    finish(&state, "metadata", request_id);
    result.map_err(|raw| record_failure(&state, &raw, "extraction"))
}

fn record_failure(state: &AppState, raw: &str, phase: &'static str) -> Failure {
    let error = Failure::classify(raw, phase);
    if let Some(seconds) = error.retry_after {
        *state.retry_at.lock().unwrap() =
            std::time::Instant::now().checked_add(std::time::Duration::from_secs(seconds));
    }
    error
}

#[tauri::command]
fn cancel_job(state: State<AppState>, kind: String, request_id: u64) -> Result<(), String> {
    if !matches!(kind.as_str(), "metadata" | "download") {
        return Err("Unknown operation.".into());
    }
    if let Some((id, cancel)) = state.jobs.lock().unwrap().get(&kind) {
        if *id == request_id {
            let _ = cancel.send(true);
        }
    }
    Ok(())
}

#[tauri::command]
async fn choose_folder(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let current = state.folder.lock().unwrap().clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_directory(current)
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let folder = chosen.into_path().map_err(|_| "Choose a local folder.")?;
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("Choose an existing folder.".into());
    }
    let config = settings_path(&app)?;
    fs::create_dir_all(config.parent().ok_or("Invalid settings directory.")?)
        .map_err(|e| e.to_string())?;
    fs::write(
        config,
        serde_json::to_vec(&folder).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Could not save the destination: {e}"))?;
    *state.folder.lock().unwrap() = folder.clone();
    Ok(Some(folder.to_string_lossy().into_owned()))
}

fn checked_output(staging: &Path, file: &str) -> Result<PathBuf, String> {
    let staging =
        fs::canonicalize(staging).map_err(|_| "The download staging folder is unavailable.")?;
    let output = fs::canonicalize(file)
        .map_err(|_| "The engine did not produce the expected output file.")?;
    if output.parent() != Some(staging.as_path()) || !output.is_file() {
        return Err("The engine did not produce the expected output file.".into());
    }
    Ok(output)
}

fn publish(staging: &Path, file: &str, destination: &Path) -> Result<PathBuf, String> {
    let output = checked_output(staging, file)?;
    let filename = output.file_name().ok_or("Invalid output filename.")?;
    let target = destination.join(filename);
    // MoveFileExW without REPLACE_EXISTING also supports FAT/exFAT destinations.
    #[cfg(windows)]
    let published = {
        use std::os::windows::ffi::OsStrExt;
        let from: Vec<u16> = output.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        let ok = unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(from.as_ptr(), to.as_ptr(), 0)
        };
        if ok != 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error())
        }
    };
    #[cfg(not(windows))]
    let published = fs::hard_link(&output, &target);
    published.map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            "This file already exists. Choose another folder or rename the existing file.".into()
        } else {
            format!(
                "Could not save the finished file (check free space and folder permissions): {e}"
            )
        }
    })?;
    Ok(target)
}

#[tauri::command]
async fn download(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: u64,
    media_id: u64,
    format: Format,
    height: Option<u32>,
    audio_bitrate: Option<u16>,
) -> Result<String, Failure> {
    let selected = state
        .selection
        .lock()
        .unwrap()
        .clone()
        .ok_or("Paste a video URL first.")?;
    if selected.media.request_id != media_id {
        return Err("The selected video has changed. Try again.".into());
    }
    if format.is_video() && !selected.media.has_video {
        return Err("This source has no video track.".into());
    }
    if !format.is_video() && !selected.media.has_audio {
        return Err("This source has no audio track.".into());
    }
    if height.is_some_and(|h| !format.is_video() || !selected.media.heights.contains(&h)) {
        return Err("This quality is not available for the selected format.".into());
    }
    if audio_bitrate.is_some_and(|b| format != Format::Mp3 || !matches!(b, 128 | 192 | 256 | 320)) {
        return Err("Choose a supported MP3 bitrate.".into());
    }
    let root = engine::engine_dir(&app)?;
    let folder = state.folder.lock().unwrap().clone();
    if !folder.is_dir() {
        return Err("The destination folder is unavailable. Choose another folder.".into());
    }
    let cancel = begin(&state, "download", request_id)?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let key = model::DownloadKey {
        url: selected.url.clone(),
        folder: folder.clone(),
        format,
        height,
        audio_bitrate: audio_bitrate.unwrap_or(192),
    };
    let recovery = state
        .recovery
        .lock()
        .unwrap()
        .clone()
        .filter(|(old, path)| *old == key && path.is_dir());
    let resuming = recovery.is_some();
    let staging = recovery
        .map(|(_, path)| path)
        .unwrap_or_else(|| folder.join(format!(".ytnabber-{}-{nonce}", std::process::id())));
    let mut created_staging = false;
    let phase = Arc::new(AtomicU8::new(0));
    let result = async {
        if !resuming {
            fs::create_dir(&staging).map_err(|e| {
                format!("Could not write to this folder (check permissions and free space): {e}")
            })?;
        }
        created_staging = true;
        let mut args = engine::download_args(&root, format, height, &staging, &selected.url);
        if let Some(bitrate) = audio_bitrate {
            if let Some(index) = args.iter().position(|a| a == "--audio-quality") {
                args[index + 1] = format!("{bitrate}K");
            }
        }
        let events = app.clone();
        let observed_phase = phase.clone();
        let file = engine::run_process(
            updater::executable(&app, &root)?,
            args,
            cancel.clone(),
            request_id,
            false,
            move |progress| {
                observed_phase.store(
                    if progress.phase == "processing" { 2 } else { 1 },
                    Ordering::SeqCst,
                );
                let _ = events.emit("download-progress", progress);
            },
        )
        .await?;
        if *cancel.borrow() {
            return Err(engine::CANCELLED.into());
        }
        let file = checked_output(&staging, file.trim())?;
        phase.store(2, Ordering::SeqCst);
        let _ = app.emit(
            "download-progress",
            model::Progress {
                request_id,
                phase: "processing".into(),
                percent: None,
                speed: None,
                downloaded: None,
                total: None,
            },
        );
        let file = media::prepare(&root, &file, format, cancel.clone()).await?;
        if *cancel.borrow() {
            return Err(engine::CANCELLED.into());
        }
        let target = publish(&staging, &file.to_string_lossy(), &folder)?;
        *state.last_file.lock().unwrap() = Some(target.clone());
        Ok::<_, String>(target.to_string_lossy().into_owned())
    }
    .await;
    // Recovery only reuses a directory previously created by this app instance for this exact request.
    if created_staging && (result.is_ok() || result.as_ref().is_err_and(|e| e == engine::CANCELLED))
    {
        let _ = fs::remove_dir_all(&staging);
        if state
            .recovery
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|(old, _)| *old == key)
        {
            *state.recovery.lock().unwrap() = None;
        }
    } else if created_staging {
        *state.recovery.lock().unwrap() = Some((key, staging.clone()));
    }
    finish(&state, "download", request_id);
    result
        .map_err(|error| {
            if created_staging && error != engine::CANCELLED {
                format!("{error}\nRecoverable files: {}", staging.display())
            } else {
                error
            }
        })
        .map_err(|raw| {
            record_failure(
                &state,
                &raw,
                match phase.load(Ordering::SeqCst) {
                    0 => "extraction",
                    1 => "download",
                    _ => "processing",
                },
            )
        })
}

#[tauri::command]
async fn engine_update(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: String,
) -> Result<updater::Status, Failure> {
    let root = engine::engine_dir(&app)?;
    let data = updater::data_dir(&app)?;
    let _cancel = begin(&state, "engine-update", 0)?;
    let result = updater::update(&data, &root, &mode).await;
    finish(&state, "engine-update", 0);
    result.map_err(|raw| Failure::classify(&raw, "engine-update"))
}

#[tauri::command]
fn open_folder(state: State<AppState>) -> Result<(), String> {
    let folder = state
        .last_file
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| state.folder.lock().unwrap().clone());
    if !folder.is_dir() {
        return Err("The destination folder no longer exists.".into());
    }
    let mut command = std::process::Command::new("explorer.exe");
    command.arg(folder);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            startup,
            inspect_media,
            cancel_job,
            choose_folder,
            download,
            open_folder,
            engine_update
        ])
        .build(tauri::generate_context!())
        .expect("Could not start ytnabber")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                for (_, sender) in state.jobs.lock().unwrap().values() {
                    let _ = sender.send(true);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn completion_preserves_existing_files_and_checks_output_path() {
        let root = std::env::temp_dir().join(format!("ytnabber-test-{}", std::process::id()));
        fs::create_dir_all(root.join("staging")).unwrap();
        let stage = root.join("staging");
        let file = stage.join("test.mp4");
        fs::write(&file, b"new").unwrap();
        fs::write(root.join("test.mp4"), b"existing").unwrap();
        assert!(publish(&stage, &file.to_string_lossy(), &root).is_err());
        assert_eq!(fs::read(root.join("test.mp4")).unwrap(), b"existing");
        assert!(publish(&stage, &root.join("outside.mp4").to_string_lossy(), &root).is_err());
        fs::remove_file(root.join("test.mp4")).unwrap();
        assert!(publish(&stage, &file.to_string_lossy(), &root).is_ok());
        assert_eq!(fs::read(root.join("test.mp4")).unwrap(), b"new");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn stale_cancellation_cannot_cancel_a_new_request() {
        let state = AppState::default();
        let first = begin(&state, "metadata", 1).unwrap();
        let second = begin(&state, "metadata", 2).unwrap();
        assert!(*first.borrow());
        finish(&state, "metadata", 1);
        assert!(!*second.borrow());
        assert!(begin(&state, "metadata", 1).is_err());
        assert!(!*second.borrow());
        assert!(state.jobs.lock().unwrap().contains_key("metadata"));
        begin(&state, "download", 3).unwrap();
        assert!(begin(&state, "download", 4).is_err());
    }
    #[test]
    fn rate_limits_block_new_metadata_and_download_requests() {
        let state = AppState::default();
        record_failure(&state, "HTTP Error 429\nRetry-After: 120", "extraction");
        assert!(begin(&state, "metadata", 1).unwrap_err().contains("429"));
        assert!(begin(&state, "download", 2).unwrap_err().contains("429"));
        assert!(state.jobs.lock().unwrap().is_empty());
    }
}
