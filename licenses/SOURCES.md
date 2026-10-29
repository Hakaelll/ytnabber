# Corresponding source and build materials

The executable downloads are pinned, unmodified upstream release assets. Their exact URLs and SHA-256 values are recorded in scripts/engine-manifest.json and the installed engines/versions.json.

## yt-dlp 2026.10.26

- [Release and source tarball](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26)
- [Exact tagged source](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26)
- [Windows executable build materials](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26/bundle)
- [Build workflow and dependency versions](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26/.github/workflows)
- [Dependency lockfile](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/uv.lock)
- [Bundled third-party notices](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/THIRD_PARTY_LICENSES.txt)

The upstream Windows binary is a GPLv3+ combined work; the source repository alone is Unlicense. Its notices identify the included components and their licenses.

## FFmpeg N-128142-g28fda48e0b, BtbN autobuild-2026-10-28-19-47

- [Exact binary release and accompanying materials](https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-10-28-19-47)
- [FFmpeg source at the binary's commit](https://github.com/FFmpeg/FFmpeg/tree/28fda48e0b)
- [Build recipes, dependency source retrieval and patches](https://github.com/BtbN/FFmpeg-Builds)
- [Upstream source retrieval instructions](https://github.com/BtbN/FFmpeg-Builds#sources)

The included LGPL shared build uses replaceable DLLs. Run engines/ffmpeg.exe -buildconf to inspect the exact build configuration. The BtbN archive includes its FFmpeg license, and that text is distributed alongside the engine. The source and build-material links are supplied next to the binary download information so recipients can retrieve them without charge.

## Deno 2.9.8

- [Exact source and third-party material](https://github.com/denoland/deno/tree/v2.9.8)
- [Deno license](https://github.com/denoland/deno/blob/v2.9.8/LICENSE.md)
- [Releases](https://github.com/denoland/deno/releases/tag/v2.9.8)

## Application dependencies

package-lock.json and src-tauri/Cargo.lock record the exact JavaScript and Rust dependencies. Their source packages include individual license metadata. ytnabber's GitHub release tag identifies the application source used to build its installer.
