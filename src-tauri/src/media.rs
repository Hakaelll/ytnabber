use crate::model::Format;
use serde_json::Value;

fn compatible_h264(stream: &Value) -> bool {
    stream["codec_name"] == "h264"
        && matches!(stream["pix_fmt"].as_str(), Some("yuv420p" | "yuvj420p"))
}
fn video_track(stream: &Value) -> bool {
    stream["codec_type"] == "video" && stream["disposition"]["attached_pic"] != 1
}

pub fn validate(info: &Value, format: Format) -> Result<(), String> {
    let streams = info["streams"]
        .as_array()
        .ok_or("FFprobe found no streams.")?;
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let video = streams.iter().find(|s| video_track(s));
    let container = info["format"]["format_name"].as_str().unwrap_or_default();
    let number = |name: &str| {
        info["format"][name]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    if number("duration") <= 0.0
        || !number("duration").is_finite()
        || number("size") <= 0.0
        || !number("size").is_finite()
    {
        return Err("FFprobe found an empty file or invalid duration.".into());
    }
    let codec = audio
        .and_then(|s| s["codec_name"].as_str())
        .unwrap_or_default();
    let valid = match format {
        Format::Mp3 => codec == "mp3" && container == "mp3" && video.is_none(),
        Format::M4a => {
            codec == "aac" && container.split(',').any(|c| c == "m4a") && video.is_none()
        }
        Format::Mp4 => {
            video.is_some_and(compatible_h264)
                && (audio.is_none() || codec == "aac")
                && container.split(',').any(|c| c == "mp4")
        }
        Format::Source => video.is_some() && container.split(',').any(|c| c == "mp4"),
        Format::Opus => codec == "opus" && container == "ogg" && video.is_none(),
    };
    if !valid {
        return Err("The generated codecs or container do not match the requested format. The recoverable file was kept.".into());
    }
    Ok(())
}

use std::path::{Path, PathBuf};
use tokio::sync::watch;

pub async fn probe(
    root: &Path,
    file: &Path,
    cancel: watch::Receiver<bool>,
) -> Result<Value, String> {
    let mut args: Vec<String> = [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    args.push(file.to_string_lossy().into_owned());
    let raw = crate::engine::tool(root, "ffprobe.exe", args, cancel).await?;
    serde_json::from_str(&raw).map_err(|_| "FFprobe returned invalid media information.".into())
}

pub async fn prepare(
    root: &Path,
    file: &Path,
    format: Format,
    cancel: watch::Receiver<bool>,
) -> Result<PathBuf, String> {
    let info = probe(root, file, cancel.clone()).await?;
    if format != Format::Mp4 || validate(&info, format).is_ok() {
        validate(&info, format)?;
        return Ok(file.to_owned());
    }
    let streams = info["streams"]
        .as_array()
        .ok_or("FFprobe found no streams.")?;
    let video = streams
        .iter()
        .find(|s| video_track(s))
        .ok_or("The downloaded file has no video.")?;
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let output = file.with_file_name(format!(
        "{}.compatible.mp4",
        file.file_stem().unwrap_or_default().to_string_lossy()
    ));
    if output.is_file() {
        if probe(root, &output, cancel.clone())
            .await
            .is_ok_and(|info| validate(&info, format).is_ok())
        {
            return Ok(output);
        }
        if *cancel.borrow() {
            return Err(crate::engine::CANCELLED.into());
        }
        std::fs::remove_file(&output)
            .map_err(|e| format!("Could not replace an incomplete conversion: {e}"))?;
    }
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i"]
        .into_iter()
        .map(str::to_owned)
        .collect();
    args.push(file.to_string_lossy().into_owned());
    let video_index = video["index"]
        .as_u64()
        .ok_or("FFprobe returned an invalid video stream index.")?;
    args.extend(["-map".into(), format!("0:{video_index}")]);
    args.extend(["-map", "0:a:0?", "-c:v"].into_iter().map(str::to_owned));
    args.push(
        if compatible_h264(video) {
            "copy"
        } else {
            "libopenh264"
        }
        .into(),
    );
    if !compatible_h264(video) {
        // Keep source dimensions; use a generous bitrate only when video conversion is unavoidable.
        args.extend(
            ["-b:v", "12M", "-pix_fmt", "yuv420p"]
                .into_iter()
                .map(str::to_owned),
        );
    }
    args.push("-c:a".into());
    args.push(
        if audio.is_none_or(|s| s["codec_name"] == "aac") {
            "copy"
        } else {
            "aac"
        }
        .into(),
    );
    if audio.is_some_and(|s| s["codec_name"] != "aac") {
        args.extend(["-b:a".into(), "192k".into()]);
    }
    args.extend([
        "-movflags".into(),
        "+faststart".into(),
        output.to_string_lossy().into_owned(),
    ]);
    crate::engine::tool(root, "ffmpeg.exe", args, cancel.clone()).await?;
    validate(&probe(root, &output, cancel).await?, format)?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture(container: &str, audio: &str, video: Option<&str>) -> Value {
        let mut streams = vec![json!({"codec_type":"audio", "codec_name":audio})];
        if let Some(codec) = video {
            streams.push(json!({"codec_type":"video", "codec_name":codec,"pix_fmt":"yuv420p"}));
        }
        json!({"streams":streams,"format":{"format_name":container,"duration":"10.0","size":"1000"}})
    }

    #[test]
    fn rejects_mislabeled_opus_and_invalid_media() {
        assert!(validate(&fixture("mp3", "opus", None), Format::Mp3).is_err());
        assert!(validate(
            &fixture("mov,mp4,m4a,3gp,3g2,mj2", "opus", None),
            Format::M4a
        )
        .is_err());
        assert!(validate(
            &fixture("mov,mp4,m4a,3gp,3g2,mj2", "opus", Some("vp9")),
            Format::Mp4
        )
        .is_err());
        assert!(validate(&fixture("mp3", "mp3", None), Format::Mp3).is_ok());
        assert!(validate(
            &fixture("mov,mp4,m4a,3gp,3g2,mj2", "aac", Some("h264")),
            Format::Mp4
        )
        .is_ok());
        for field in ["duration", "size"] {
            let mut empty = fixture("mp3", "mp3", None);
            empty["format"][field] = json!("NaN");
            assert!(validate(&empty, Format::Mp3).is_err());
        }
    }
    #[test]
    fn compatible_mp4_rejects_ten_bit_h264() {
        let mut info = fixture("mov,mp4,m4a,3gp,3g2,mj2", "aac", Some("h264"));
        info["streams"][1]["pix_fmt"] = json!("yuv420p10le");
        assert!(validate(&info, Format::Mp4).is_err());
        assert!(validate(&info, Format::Source).is_ok());
    }
    #[test]
    fn audio_cover_art_is_not_a_video_track() {
        let mut info = fixture("mp3", "mp3", Some("mjpeg"));
        info["streams"][1]["disposition"] = json!({"attached_pic":1});
        assert!(validate(&info, Format::Mp3).is_ok());
    }
}
