//! Opt-in checks against public media with the exact engine arguments used by the app.
use crate::{
    engine,
    model::{self, Format, Progress},
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::watch;

fn engines() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("engines")
}
fn probe(root: &Path, file: &Path) -> serde_json::Value {
    let output = Command::new(root.join("ffprobe.exe"))
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(file)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
#[tokio::test]
#[ignore = "Requires prepared Windows engines and Internet access; run npm run test:engines"]
async fn real_engines_download_convert_report_progress_and_cancel() {
    let root = engines();
    let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../.cache")
        .join(format!(
            "smoke-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
    fs::create_dir_all(&folder).unwrap();
    let url = "https://www.w3schools.com/html/mov_bbb.mp4";
    let (_sender, receiver) = watch::channel(false);
    let mut args = engine::base_args(&root);
    args.extend([
        "--dump-single-json".into(),
        "--skip-download".into(),
        "--".into(),
        url.into(),
    ]);
    let raw = engine::run(&root, args, receiver, 1, true, |_| {})
        .await
        .unwrap();
    let media = model::parse_media(&raw, 1).unwrap();
    assert!(media.has_video && media.has_audio);
    println!("Metadata: {}", media.title);
    for (id, format, extension, codec) in [
        (2, Format::Mp4, "mp4", "h264"),
        (3, Format::Mp3, "mp3", "mp3"),
        (4, Format::M4a, "m4a", "aac"),
    ] {
        let staging = folder.join(extension);
        fs::create_dir(&staging).unwrap();
        let (_sender, receiver) = watch::channel(false);
        let events = Arc::new(Mutex::new(Vec::<Progress>::new()));
        let recorded = events.clone();
        let file = engine::run(
            &root,
            engine::download_args(&root, format, None, &staging, url),
            receiver,
            id,
            false,
            move |progress| recorded.lock().unwrap().push(progress),
        )
        .await
        .unwrap();
        let file = PathBuf::from(file);
        assert_eq!(file.extension().unwrap(), extension);
        let info = probe(&root, &file);
        assert!(
            info["format"]["duration"]
                .as_str()
                .unwrap()
                .parse::<f64>()
                .unwrap()
                > 9.0
        );
        assert!(
            info["streams"]
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s["codec_name"] == codec),
            "{info}"
        );
        let events = events.lock().unwrap();
        assert!(
            events.iter().any(|p| p.percent.is_some()),
            "Expected real transfer progress"
        );
        if format != Format::Mp4 {
            assert!(
                events.iter().any(|p| p.phase == "processing"),
                "Expected indeterminate conversion status"
            );
            assert!(info["streams"]
                .as_array()
                .unwrap()
                .iter()
                .all(|s| s["codec_type"] != "video"));
        }
        let saved = crate::publish(&staging, &file.to_string_lossy(), &folder).unwrap();
        assert!(saved.is_file());
        println!(
            "Verified {}: {} bytes; {} progress events",
            extension,
            saved.metadata().unwrap().len(),
            events.len()
        );
    }
    let staging = folder.join("cancelled");
    fs::create_dir(&staging).unwrap();
    let (sender, receiver) = watch::channel(false);
    let mut args = engine::download_args(&root, Format::Mp4, None, &staging, url);
    args.splice(0..0, ["--limit-rate".into(), "10K".into()]);
    let start = std::time::Instant::now();
    let result = engine::run(&root, args, receiver, 5, false, move |progress| {
        if progress.downloaded.is_some_and(|v| v > 0.0) {
            let _ = sender.send(true);
        }
    })
    .await;
    assert_eq!(result.unwrap_err(), engine::CANCELLED);
    assert!(start.elapsed().as_secs() < 15);
    assert!(!staging.read_dir().unwrap().any(|p| p
        .unwrap()
        .path()
        .extension()
        .is_some_and(|ext| ext == "mp4")));
    println!(
        "Cancellation completed in {:.2}s",
        start.elapsed().as_secs_f64()
    );
    let (_sender, receiver) = watch::channel(false);
    let mut args = engine::base_args(&root);
    args.extend([
        "--dump-single-json".into(),
        "--".into(),
        "https://www.w3schools.com/this-video-does-not-exist-404.mp4".into(),
    ]);
    assert!(engine::run(&root, args, receiver, 6, true, |_| {})
        .await
        .is_err());
    println!("Unavailable-source failure verified.");
    fs::remove_dir_all(folder).unwrap();
}

#[tokio::test]
#[ignore = "Requires prepared Windows engines and Internet access; run npm run test:engines"]
async fn real_engines_youtube_metadata_and_separate_track_merge() {
    let root = engines();
    let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../.cache")
        .join(format!(
            "youtube-smoke-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
    fs::create_dir_all(&folder).unwrap();
    let url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    let (_sender, receiver) = watch::channel(false);
    let mut args = engine::base_args(&root);
    args.extend([
        "--dump-single-json".into(),
        "--skip-download".into(),
        "--".into(),
        url.into(),
    ]);
    let raw = engine::run(&root, args, receiver, 20, true, |_| {})
        .await
        .unwrap();
    let media = model::parse_media(&raw, 20).unwrap();
    assert_eq!(media.title, "Me at the zoo");
    assert!(media.duration.is_some() && media.thumbnail.is_some());
    let height = *media.heights.last().unwrap();
    let (_sender, receiver) = watch::channel(false);
    let events = Arc::new(Mutex::new(Vec::<Progress>::new()));
    let recorded = events.clone();
    let file = engine::run(
        &root,
        engine::download_args(&root, Format::Mp4, Some(height), &folder, url),
        receiver,
        21,
        false,
        move |p| recorded.lock().unwrap().push(p),
    )
    .await
    .unwrap();
    let info = probe(&root, Path::new(&file));
    let streams = info["streams"].as_array().unwrap();
    assert!(streams
        .iter()
        .any(|s| s["codec_type"] == "video" && s["height"].as_u64() == Some(height as u64)));
    assert!(streams.iter().any(|s| s["codec_type"] == "audio"));
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|p| p.phase == "processing"));
    println!(
        "YouTube {}p: video + audio merged and probed successfully.",
        height
    );
    fs::remove_dir_all(folder).unwrap();
}

#[tokio::test]
#[ignore = "Requires prepared Windows engines and Internet access; run npm run test:engines"]
async fn real_engines_windows_filename_regression() {
    let root = engines();
    let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../.cache")
        .join("prueba-á")
        .join(format!(
            "filename-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
    fs::create_dir_all(&folder).unwrap();
    let (sender, receiver) = watch::channel(false);
    let mut args = engine::download_args(
        &root,
        Format::Mp4,
        None,
        &folder,
        "https://www.w3schools.com/html/mov_bbb.mp4",
    );
    let template = args.iter().position(|a| a == "-o").unwrap() + 1;
    args[template] = "Vídeo ｜ Windows [%(id)s].%(ext)s".into();
    let file = engine::run(&root, args, receiver, 30, false, |_| {})
        .await
        .unwrap();

    let saved = crate::publish(&folder, &file, folder.parent().unwrap()).unwrap();
    assert!(saved.is_file());
    fs::remove_file(saved).unwrap();
    fs::remove_dir_all(folder).unwrap();
    drop(sender);
}

#[tokio::test]
#[ignore = "Requires prepared Windows engines and Internet access; run npm run test:engines"]
async fn real_engines_cancel_during_ffmpeg_conversion() {
    use std::sync::atomic::{AtomicBool, Ordering};
    let root = engines();
    let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../.cache")
        .join(format!(
            "conversion-cancel-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
    fs::create_dir_all(&folder).unwrap();
    let (sender, receiver) = watch::channel(false);
    let started = Arc::new(AtomicBool::new(false));
    let output_seen = Arc::new(AtomicBool::new(false));
    let checked_output = output_seen.clone();
    let destination = folder.clone();
    let mut args = engine::download_args(
        &root,
        Format::Mp3,
        None,
        &folder,
        "https://www.w3schools.com/html/mov_bbb.mp4",
    );
    // Read at source speed so the test can cancel a live FFmpeg process rather than a finished conversion.
    args.splice(0..0, ["--postprocessor-args".into(), "ffmpeg_i:-re".into()]);
    let result = engine::run(&root, args, receiver, 40, false, move |progress| {
        if progress.phase == "processing" && !started.swap(true, Ordering::SeqCst) {
            let sender = sender.clone();
            let destination = destination.clone();
            let checked_output = checked_output.clone();
            tokio::spawn(async move {
                for _ in 0..40 {
                    let writing = fs::read_dir(&destination).unwrap().any(|entry| {
                        entry
                            .unwrap()
                            .path()
                            .extension()
                            .is_some_and(|ext| ext == "mp3")
                    });
                    if writing {
                        checked_output.store(true, Ordering::SeqCst);
                        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        let _ = sender.send(true);
                        return;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
                let _ = sender.send(true);
            });
        }
    })
    .await;
    assert_eq!(result.unwrap_err(), engine::CANCELLED);
    assert!(
        output_seen.load(Ordering::SeqCst),
        "FFmpeg must have started writing the MP3 before cancellation"
    );
    fs::remove_dir_all(folder).unwrap();
    println!("Cancelled a live FFmpeg conversion and removed its unlocked partial files.");
}
