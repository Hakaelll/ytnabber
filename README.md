# ytnabber

A compact Windows desktop app for downloading a single video or saving its audio. Built with Tauri 2, Rust, TypeScript and Canvas 2D.

![ytnabber](docs/screenshot.png)

## Download

Get the **Windows x64 installer** from [GitHub Releases](https://github.com/Hakaelll/ytnabber/releases/latest). Installation is per user and does not require administrator rights.

Windows 10 or 11 and Microsoft Edge WebView2 are required. If WebView2 is missing, the installer downloads Microsoft's runtime. yt-dlp, Deno and FFmpeg are already included: no terminal, Python installation or manual PATH setup is needed.

The initial release is unsigned. Download the installer from this repository.

## Use

1. Paste a public video URL. Metadata loads automatically, or press Enter.
2. Select **MP4**, **MP3**, **M4A** or **Opus**.
3. For MP4, choose compatible H.264/AAC at an available resolution, or explicitly keep the best original codecs. For MP3, choose a conversion bitrate (192 kbps by default).
4. Choose a destination if needed, then click **Download**.
5. Click **Open folder** after the file is saved.

The app remembers your last destination and otherwise uses your Windows Downloads folder. Downloads can be cancelled, including while FFmpeg is processing media. Existing files are never replaced; choose another destination or rename an existing file to download the same output again.

Compatible MP4 prefers H.264 video and AAC audio. It copies compatible tracks and converts only incompatible tracks, retaining the selected resolution. The original-codecs quality option preserves the best source video without forcing H.264. MP3 is genuinely converted when needed; existing MP3 audio keeps its bitrate and cover art. M4A prefers AAC, and Opus is an explicit choice. FFprobe checks the actual streams, container, duration and size before publication. Audio quality cannot exceed the original. Direct links may omit duration, thumbnail or resolution; the app does not invent those fields.

The titlebar's engine action checks for official yt-dlp updates. **Update engine** installs a checksum-verified stable release without replacing an engine in use; **Restore previous** rolls it back. Updates require your action and do not import cookies or credentials.

## Interface

- One compact window, no queue, account, history or settings screen.
- Monochrome Graphite surfaces with a restrained Liquid Glass treatment on controls.
- The supplied sun emblem reconstructed as a layered point sculpture, rotating to the right.
- An autonomous field of tiny characters: warped sheets, currents, empty regions and blue-gray wave deformation. It does not react to the mouse.
- A 25 FPS animation cap, bounded canvas resolution, pre-rendered glyphs and an adaptive character count.
- Animation stops while the document is hidden and respects Windows reduced-motion preferences. Reduced transparency and high-contrast modes receive solid control surfaces.

## Develop

Use Windows x64 with:

- Node.js 24 LTS and npm (verified with 24.21.0).
- Stable Rust with the MSVC toolchain.
- Microsoft C++ Build Tools, including **Desktop development with C++** and its vcpkg component.
- Microsoft Edge WebView2.

See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for the native build tools.

~~~powershell
npm ci
npm run engines:prepare
npm run desktop:dev
~~~

Preparation verifies the official yt-dlp and Deno archives against committed SHA-256 hashes. It builds a compact shared FFmpeg from verified upstream sources using the pinned vcpkg recipe in scripts/ffmpeg. Its first build downloads developer tools and can take about 15 minutes; subsequent builds reuse the local installation. The FFmpeg source build needs a checkout path without spaces; installed app paths can contain spaces and Unicode. No compiler or build tools ship to users.

The build verifies the prepared manifest, FFmpeg recipe and every engine resource hash before packaging. Stale tools, missing files and debug resources fail that check. Build caches under .cache, node_modules, source files and PDBs are excluded from distribution.

~~~powershell
npm run desktop:build
~~~

The installer is generated in:

~~~text
src-tauri/target/release/bundle/nsis/ytnabber_0.1.1_x64-setup.exe
~~~

Running npm run dev alone starts a visual browser preview. Native downloads and window controls require the desktop app.

## Checks

~~~powershell
npm run check
npm test
npm run test:native
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
~~~

Prepared engines and an Internet connection enable the opt-in integration checks:

~~~powershell
npm run test:engines
~~~

These sequential checks generate offline 720p/1080p and VP9/Opus fixtures, produce and decode compatible MP4/MP3/M4A/Opus, preserve MP3 cover art, inspect transfer/conversion events, cancel active transfers and FFmpeg, reject corrupt/missing inputs, and check Unicode paths. Public checks also verify real Deno EJS solving and download/merge YouTube tracks, including two-second Big Buck Bunny samples at 720p/1080p. They depend on external sites remaining available. Unit tests do not need Internet once dependencies are installed.

See the [0.1.1 engineering report](docs/UPDATE-0.1.1.md) for current checks, measurements and pending clean-machine/manual tests. [0.1.0 verification](docs/VERIFICATION.md) is historical evidence.

## Engines and size

| Component | Bundled version | Source |
| --- | --- | --- |
| yt-dlp | 2026.10.26 | [Official release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26) |
| Deno | 2.9.8 | [Official release](https://github.com/denoland/deno/releases/tag/v2.9.8) |
| FFmpeg / ffprobe | 9.0.2 | [Official source](https://github.com/FFmpeg/FFmpeg/tree/n9.0.2), compact LGPL shared build using pinned vcpkg recipes |

The Rust application and frontend are small; the bundled media engines account for most of the download and installed size. FFmpeg shares its DLLs between ffmpeg and ffprobe instead of shipping two large static copies. Exact sizes are recorded in the verification document.

The official yt-dlp executable includes matching EJS scripts. Deno is explicitly selected from the bundled directory for YouTube challenge processing; no system PATH tools are required. Deno and FFmpeg updates remain pinned build changes. yt-dlp can also be updated independently through the explicit, verified update action. See the [runtime comparison](docs/RUNTIMES.md) for measured smaller alternatives and their security tradeoffs.

Run `npm run size:release` after a production build to record actual installer/payload bytes and the ten largest files. Payload size excludes shared WebView2, the uninstaller and user data; it is not a clean-machine installed-size claim.

## Safety and limits

The native layer passes structured arguments directly to executables, disables user yt-dlp configuration and plugin discovery, and validates URLs and selections. Metadata requests are cancellable and older results cannot replace a newer selection.

Downloads use owned staging directories inside the destination. Finished files are moved into place without replacing existing files. Successful operations and explicit cancellation clean their staging; errors retain recoverable inputs and outputs. Retrying an identical request in the same app session can resume it. Technical error details include the retained directory. A crash or app restart can leave .ytnabber-* folders requiring manual recovery; do not delete one while a download is running.

Only individual, publicly accessible videos are supported. Playlists, live streams, sign-in, cookies, DRM circumvention, access-restriction workarounds and bulk downloads are outside this version. Source sites can deny requests independently of the app. Errors distinguish throttling, session verification, 403 access denial, unavailable formats, missing tools and processing failures. A 429 stops immediate retries and applies a wait; bounded transient retries use backoff. Original-codec MP4 files may need a player or Windows codec extension supporting those codecs. The compatible profile targets ordinary H.264/AAC playback; universal source/player support is not promised.

There is no telemetry or hosted application backend. Network requests go to the selected source and its media/thumbnail hosts, and to official GitHub releases when checking/updating the engine. The destination and explicit engine update state are stored per user. Error details redact URLs and secret-bearing lines before display/copy; no credentials are requested or logged.

## Source layout

~~~text
src/                  Interface, state transitions and Canvas artwork
src-tauri/src/        Metadata, processes, file handling and native commands
scripts/              Verified engine preparation and artwork generation
tests/                Frontend utility regression tests
licenses/             Upstream licenses and source information
docs/                 Design decisions and release verification
~~~

The point map and Windows icons are committed. To regenerate them after an intentional artwork change, run scripts/prepare-artwork.py with Python and Pillow. This is not needed to build or use the app.

See [third-party notices](THIRD_PARTY_NOTICES.md) and [source information](licenses/SOURCES.md) for the separately bundled tools. The supplied logo and emblem belong to their respective owner; this repository does not grant additional rights to them.
