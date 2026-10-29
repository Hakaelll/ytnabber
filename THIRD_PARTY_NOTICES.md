# Third-party notices

ytnabber launches the following separate, unmodified executables. They are not linked into its Rust binary.

- **yt-dlp 2026.10.26**: yt-dlp's source is under the Unlicense. The official PyInstaller Windows executable includes GPLv3+ code and is distributed under GPLv3+ as a combined work. See licenses/yt-dlp.txt, licenses/yt-dlp-third-party.txt and licenses/GPL-3.0.txt.
- **Deno 2.9.8**: MIT, with additional third-party components documented in its upstream source. See licenses/deno.txt.
- **FFmpeg N-128142-g28fda48e0b**: BtbN's Windows x64 LGPL shared build, linked by ffmpeg.org. The archive's LGPLv3 license is included verbatim as licenses/ffmpeg-lgpl.txt and engines/ffmpeg-LICENSE.txt. The build excludes GPL and nonfree FFmpeg components; FFmpeg and ffprobe share replaceable DLLs.
- **Tauri, Vite, TypeScript and Rust dependencies**: license metadata is available in their published packages and the committed dependency lockfiles.

Exact corresponding upstream source and build-material locations are listed in licenses/SOURCES.md. All licenses in that directory accompany the installer. The separate engines and shared libraries can be replaced by compatible versions in the installed engines directory; ytnabber does not modify or restrict their replacement.

The supplied emblem and application logo were provided by the project owner. No license to those assets is implied.
