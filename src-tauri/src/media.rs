use crate::model::Format;
use serde_json::Value;

pub fn validate(info: &Value, format: Format) -> Result<(), String> {
    let streams = info["streams"]
        .as_array()
        .ok_or("FFprobe found no streams.")?;
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let video = streams.iter().find(|s| s["codec_type"] == "video");
    let container = info["format"]["format_name"].as_str().unwrap_or_default();
    let number = |name: &str| {
        info["format"][name]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    };
    if number("duration") <= 0.0 || !number("duration").is_finite() || number("size") <= 0.0 {
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
            video.is_some_and(|v| v["codec_name"] == "h264")
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
        .find(|s| s["codec_type"] == "video")
        .ok_or("The downloaded file has no video.")?;
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let output = file.with_file_name(format!(
        "{}.compatible.mp4",
        file.file_stem().unwrap_or_default().to_string_lossy()
    ));
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i"]
        .into_iter()
        .map(str::to_owned)
        .collect();
    args.push(file.to_string_lossy().into_owned());
    args.extend(
        ["-map", "0:v:0", "-map", "0:a:0?", "-c:v"]
            .into_iter()
            .map(str::to_owned),
    );
    args.push(
        if video["codec_name"] == "h264" {
            "copy"
        } else {
            "libopenh264"
        }
        .into(),
    );
    if video["codec_name"] != "h264" {
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
            streams.push(json!({"codec_type":"video", "codec_name":codec}));
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
        let mut empty = fixture("mp3", "mp3", None);
        empty["format"]["duration"] = json!("NaN");
        assert!(validate(&empty, Format::Mp3).is_err());
    }
}
