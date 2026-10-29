# 0.1.1 engineering audit and release work

## Baseline (29 October 2026, before source changes)

Source: clean Desktop checkout at `82db38b`, identical to origin/main;
release tag `v0.1.0` is also available. Measurements below are file bytes,
not estimates or allocated disk size. MiB means 1,048,576 bytes.

| Component | Bytes | MiB |
| --- | ---: | ---: |
| NSIS 0.1.0 installer | 108,941,644 | 103.89 |
| Existing artifacts/runtime staging (15 files) | 292,240,162 | 278.70 |
| Native release executable | 7,819,776 | 7.46 |
| Engines directory | 284,420,386 | 271.24 |
| Frontend dist (embedded in native executable) | 1,304,713 | 1.24 |
| Original graphic assets | 1,186,617 | 1.13 |
| License resources | 290,981 | 0.28 |
| Development node_modules (not shipped) | 63,788,566 | 60.83 |
| Development .cache (not shipped) | 1,187,943,080 | 1132.91 |

The existing runtime staging omits some installed notices; it is **not** a
measurement of an actual installed application's directory. WebView2 is a
shared Windows runtime downloaded by the installer when absent; its disk
usage is external to these totals. Temporary media sizes depend on each job.
There is no fixed bundled Chromium runtime, font package or animation video.
Animations are Canvas code and sampled emblem points embedded in the frontend.

Largest ten individual shipped components:

| File | Bytes | MiB |
| --- | ---: | ---: |
| deno.exe | 98,081,568 | 93.54 |
| avcodec-63.dll | 92,657,664 | 88.37 |
| avfilter-12.dll | 32,043,008 | 30.56 |
| avformat-63.dll | 25,978,368 | 24.77 |
| yt-dlp.exe | 23,575,744 | 22.48 |
| ytnabber.exe | 7,819,776 | 7.46 |
| avdevice-63.dll | 5,008,384 | 4.78 |
| avutil-61.dll | 3,050,496 | 2.91 |
| swscale-10.dll | 2,415,104 | 2.30 |
| swresample-7.dll | 751,616 | 0.72 |

Build caches, old engine archives, test media and portable staging duplicate
engines on the developer's machine, but are excluded from the installer.
Removing them would not reduce the user's installation. FFmpeg and FFprobe
already share DLLs; simply switching to two static executables may grow it.

## Architecture and production path

Tauri 2 Rust backend; TypeScript/Vite frontend with only @tauri-apps/api as
a production JS dependency. Cargo release already uses LTO, one codegen unit,
size optimization and stripped symbols. `npm run desktop:build` builds the
frontend, embeds it in the native executable, and generates a per-user NSIS
installer. Resource mappings ship engines and licenses only. No source maps,
node_modules, Python installation, Rust toolchain or development tests ship.

Tokio launches yt-dlp directly with argument arrays, captures both pipes,
disables user config/plugins, and selects bundled Deno and FFmpeg explicitly.
Windows Job Objects kill descendants on cancellation/exit. One download is
allowed at a time; metadata requests replace older ones. Download staging is
on the destination volume and publish refuses to overwrite existing files.

The pinned official yt-dlp Windows executable includes Python and matching
yt-dlp-ejs. There is no second Python runtime. Deno 2.9.8 is already bundled;
existence checks currently do not demonstrate JS challenge execution.
There is no app or engine updater. Engine preparation verifies pinned hashes.

The checked-in installer configuration uses Tauri's NSIS template, current-user
installation, existing icon and a WebView2 download bootstrapper. No separate
custom NSIS template/artwork/animation is present in this checkout. Preserve
this configuration and the application's existing visual assets and animations.

## Confirmed correction targets

- MP4 currently remuxes arbitrary codecs: prior verification explicitly records
  VP9/Opus in MP4. Remuxing cannot make these H.264/AAC.
- MP3 is genuinely converted, but uses V0 rather than configurable 192 kbps.
- FFprobe is only used by tests, never to gate successful publication.
- Error presentation conflates bot authentication and HTTP 429. No structured
  error code, retry policy or inspectable sanitized diagnostic is exposed.
- yt-dlp retries are bounded but have no explicit backoff; fragment defaults
  are not overridden. Warnings are hidden.
- All staging is deleted after errors, including recoverable conversion inputs
  and finished files rejected because their destination already exists.
- No explicit Opus or original/high-quality video choice exists.
- Independent safe engine updates and rollback are missing.

## Runtime and size investigation

The [official EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS) recommends
Deno (minimum 2.3.0), supports Node and QuickJS/QuickJS-NG, and deprecates Bun.
It explicitly requires `deno`, **not denort**. `deno compile` produces a
script-specific executable, not a drop-in CLI for arbitrary yt-dlp challenges.
Deno execution is permission restricted by yt-dlp; no extra permissions or
remote EJS downloads are necessary with the official bundled executable.

Investigate actual official Windows runtime assets and challenge behavior
before selecting a smaller runtime. Avoid shipping two runtimes or depending
on a developer's PATH. A smaller archive alone is not an installed-size gain.
QuickJS has different permission and temporary-script constraints documented
upstream, so successful `--version` output alone cannot justify replacement.

## Verification status

Baseline figures above were measured in this run. Historical 0.1.0 checks are
recorded separately in VERIFICATION.md and are not fresh 0.1.1 results.
Clean Windows 10/11 installation, upgrade/uninstall and real player checks
remain required; no clean VM is currently established. Do not publish a claim
that these checks passed without running them.
