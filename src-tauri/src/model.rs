use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub request_id: u64,
    pub title: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub heights: Vec<u32>,
    pub has_audio: bool,
    pub has_video: bool,
}

#[derive(Clone)]
pub struct Selection {
    pub url: String,
    pub media: Media,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Mp4,
    Mp3,
    M4a,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub request_id: u64,
    pub phase: String,
    pub percent: Option<f64>,
    pub speed: Option<f64>,
    pub downloaded: Option<f64>,
    pub total: Option<f64>,
}

pub fn validate_url(input: &str) -> Result<String, String> {
    let parsed = url::Url::parse(input.trim())
        .map_err(|_| "Paste a complete http:// or https:// video URL.")?;
    if !matches!(parsed.scheme(), "https" | "http")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Use a public HTTP or HTTPS video URL without credentials.".into());
    }
    let host = parsed.host_str().unwrap_or_default();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err("Local network URLs are not supported.".into());
    }
    if let Some(url::Host::Ipv4(ip)) = parsed.host() {
        if ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() {
            return Err("Local network URLs are not supported.".into());
        }
    }
    if let Some(url::Host::Ipv6(ip)) = parsed.host() {
        if ip.is_loopback()
            || ip.is_unspecified()
            || (ip.segments()[0] & 0xfe00 == 0xfc00)
            || (ip.segments()[0] & 0xffc0 == 0xfe80)
            || ip.to_ipv4_mapped().is_some()
        {
            return Err("Local network URLs are not supported.".into());
        }
    }
    Ok(parsed.to_string())
}

pub fn parse_media(raw: &str, request_id: u64) -> Result<Media, String> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|_| "The source returned unreadable video information.")?;
    if value.get("entries").is_some() || value["_type"] == "playlist" {
        return Err("Choose a single video. Playlists are not supported.".into());
    }
    if value["is_live"] == true || value["live_status"] == "is_upcoming" {
        return Err("Choose a finished video. Live and upcoming streams are not supported.".into());
    }
    let formats = value["formats"]
        .as_array()
        .ok_or("No downloadable formats were found.")?;
    let mut heights = BTreeSet::new();
    let mut has_audio = false;
    let mut has_video = false;
    for f in formats {
        if f["has_drm"] == true {
            continue;
        }
        let video = f["vcodec"].as_str().map_or_else(
            || f["video_ext"].as_str().is_some_and(|ext| ext != "none"),
            |codec| codec != "none",
        );
        // Direct media links can omit codecs; let the engine probe their audio.
        let audio = f["acodec"].as_str().map_or_else(
            || video || f["audio_ext"].as_str().is_some_and(|ext| ext != "none"),
            |codec| codec != "none",
        );
        has_video |= video;
        has_audio |= audio;
        if video {
            if let Some(height) = f["height"].as_u64().filter(|h| *h > 0 && *h <= 16384) {
                heights.insert(height as u32);
            }
        }
    }
    if !has_audio && !has_video {
        return Err("This source has no supported public formats.".into());
    }
    Ok(Media {
        request_id,
        title: value["title"]
            .as_str()
            .unwrap_or("Untitled video")
            .to_owned(),
        duration: value["duration"].as_f64(),
        thumbnail: value["thumbnail"]
            .as_str()
            .filter(|s| s.starts_with("https://"))
            .map(str::to_owned),
        uploader: value["uploader"].as_str().map(str::to_owned),
        heights: heights.into_iter().rev().collect(),
        has_audio,
        has_video,
    })
}

pub fn format_args(format: Format, height: Option<u32>) -> Vec<String> {
    match format {
        Format::Mp4 => {
            let filter = height.map(|h| format!("[height={h}]")).unwrap_or_default();
            vec![
                "-f".into(),
                format!("bv{filter}+ba/b{filter}/bv{filter}"),
                "--merge-output-format".into(),
                "mp4".into(),
                "--remux-video".into(),
                "mp4".into(),
            ]
        }
        Format::Mp3 => vec![
            "-f",
            "bestaudio/best",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect(),
        Format::M4a => vec![
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "-x",
            "--audio-format",
            "m4a",
            "--audio-quality",
            "0",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect(),
    }
}

pub fn parse_progress(line: &str, request_id: u64) -> Option<Progress> {
    let raw = line.strip_prefix("__PROGRESS__")?;
    let p: Value = serde_json::from_str(raw).ok()?;
    let downloaded = p["downloaded_bytes"].as_f64();
    let total = p["total_bytes"]
        .as_f64()
        .or_else(|| p["total_bytes_estimate"].as_f64());
    let percent = downloaded
        .zip(total)
        .filter(|(_, t)| *t > 0.0)
        .map(|(d, t)| (100.0 * d / t).clamp(0.0, 100.0));
    Some(Progress {
        request_id,
        phase: "downloading".into(),
        percent,
        speed: p["speed"].as_f64(),
        downloaded,
        total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn url_boundary() {
        assert!(validate_url("https://www.youtube.com/watch?v=abc&list=x").is_ok());
        for u in [
            "file:///secret",
            "--exec=bad",
            "https://user:pass@host.com",
            "http://localhost/x",
            "http://192.168.1.1/a",
            "http://[::1]/a",
            "http://[::ffff:127.0.0.1]/x",
        ] {
            assert!(validate_url(u).is_err(), "{u}");
        }
    }
    #[test]
    fn metadata_only_lists_real_non_drm_heights() {
        let m = parse_media(r#"{"title":"Test","formats":[{"vcodec":"avc1","height":720,"acodec":"none"},{"vcodec":"vp9","height":720},{"vcodec":"av1","height":2160,"has_drm":true},{"vcodec":"none","acodec":"aac"}]}"#, 7).unwrap();
        assert_eq!(m.heights, vec![720]);
        assert!(m.has_audio && m.has_video);
        assert!(parse_media(r#"{"entries":[]}"#, 1).is_err());
        assert!(parse_media(r#"{"is_live":true}"#, 1).is_err());
    }
    #[test]
    fn direct_media_without_codec_metadata_remains_usable() {
        let media = parse_media(r#"{"title":"Direct file","formats":[{"vcodec":null,"ext":"mp4","video_ext":"mp4","audio_ext":"none"}]}"#, 1).unwrap();
        assert!(media.has_video && media.has_audio);
        assert!(media.heights.is_empty());
        assert_eq!(media.duration, None);
    }
    #[test]
    fn progress_handles_unknown_size_and_clamps() {
        let p = parse_progress(
            r#"__PROGRESS__{"downloaded_bytes":50,"total_bytes":100,"speed":24}"#,
            2,
        )
        .unwrap();
        assert_eq!(p.percent, Some(50.0));
        assert_eq!(p.speed, Some(24.0));
        assert_eq!(
            parse_progress(r#"__PROGRESS__{"downloaded_bytes":50}"#, 1)
                .unwrap()
                .percent,
            None
        );
        assert_eq!(
            parse_progress(
                r#"__PROGRESS__{"downloaded_bytes":120,"total_bytes":100}"#,
                1
            )
            .unwrap()
            .percent,
            Some(100.0)
        );
        assert!(parse_progress("bad", 1).is_none());
    }
    #[test]
    fn quality_is_exact_and_audio_has_no_resolution() {
        assert!(format_args(Format::Mp4, Some(720))[1].contains("[height=720]"));
        assert!(!format_args(Format::M4a, None).join(" ").contains("height"));
        assert!(format_args(Format::Mp3, None).contains(&"mp3".to_owned()));
    }
}
