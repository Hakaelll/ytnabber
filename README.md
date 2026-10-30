# ytnabber

A compact Windows app for downloading one public video or saving its audio.

## Download

Get the **Windows x64 installer** from [Releases](https://github.com/Hakaelll/ytnabber/releases/latest). Requires Windows 10/11 and Microsoft WebView2, which the installer can set up if missing. Installation is per user, without admin rights.

yt-dlp, Deno and FFmpeg are included. No Python, terminal or manual tool setup is needed. The installer is unsigned.

## Use

1. Paste a public video link. Information loads automatically, or press Enter.
2. Choose **MP4**, **MP3**, **M4A** or **Opus**, then select the available quality.
3. Choose a folder and click **Download**. Cancel at any time, including during processing.

MP4 defaults to compatible H.264/AAC; original source codecs are also available. MP3 defaults to 192 kbps. Existing files are never overwritten, and the last destination is remembered. Failed downloads retain recoverable files; an identical retry in the same session can resume them.

## Interface

Dark optical-glass controls, a rotating sun emblem and a flowing field of tiny characters. The layout adapts to compact and maximized windows. Video previews keep their proportions; loading, download and processing have distinct feedback. Format changes and preview entry/exit transition smoothly.

Animation pauses while hidden and respects reduced motion, transparency and contrast preferences. No accounts, history, queue or telemetry.

## Develop

Requires Node.js 24 LTS, stable Rust/MSVC, Microsoft C++ Build Tools with vcpkg, and WebView2. See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

```powershell
npm ci
npm run engines:prepare
npm run desktop:dev
```

Engine preparation verifies pinned tools and builds compact shared FFmpeg. The first build can take several minutes; use a checkout path without spaces.

```powershell
npm run check
npm test
npm run test:native
npm run desktop:build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. `npm run dev` provides a browser preview; native downloads require the desktop app. Opt-in engine integration checks are available through `npm run test:engines`.

## Limits and documentation

Only individual public videos are supported. Playlists, live streams, sign-in, cookies and access-restriction workarounds are outside this version. Source sites may throttle or deny requests independently of the app. Audio quality cannot exceed the source, and original-codec files may require additional player support.

- [Current visual checks and known verification limits](docs/OPTICAL-GLASS.md)
- [Architecture](docs/IMPLEMENTATION.md) and [engine verification](docs/UPDATE-0.1.1.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md) and [source/license information](licenses/SOURCES.md)

The supplied logo and emblem belong to their respective owner.
