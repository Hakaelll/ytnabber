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

### Codec correction block

MP4 now prefers H.264/AAC at the requested resolution. After download the
app probes actual streams, duration, size and container; incompatible MP4
tracks are converted separately (copy compatible video/audio). The existing
Quality control also offers original video codecs explicitly, preserving
the source's highest-quality option. MP3 defaults to 192 kbps, with
128/256/320 available in that control; M4A prefers AAC, and explicit Opus
was added to the existing format buttons. No artwork/CSS/animation changes.

Publication is gated on FFprobe validation. Conversion/verification errors
retain the staging inputs; error details identify their directory. Explicit
cancellation cleans that operation's staging. Existing files remain protected.

Fresh checks: 9 native unit tests, 4 frontend tests, TypeScript, production
frontend build and clippy with denied warnings passed. The codec selection
regression was observed failing before the fix. An offline real-engine test
generated VP9/Opus with FFmpeg in a Unicode path with spaces, ran the app's
yt-dlp selectors and processing path for compatible MP4, original MP4, MP3,
M4A and Opus, validated every output with FFprobe and fully decoded each.
All five passed. This is not a clean-machine or Windows-player check.

### Error and retry correction block

Extraction/download commands return structured codes, user guidance, phase,
sanitized technical details, retryability and an optional wait. Bot/session
verification is distinct from throttling. HTTP 403 is reported as access
denial without assuming a PO-token cause. No cookies or credentials are read.
Details are available through the inline Copy details action and tooltip;
secret-bearing diagnostic lines and URLs are redacted before IPC.

HTTP/fragment/extractor retries are bounded and use exponential sleeps.
Missing fragments abort instead of silently publishing incomplete media.
An observed 429 stops the process tree and places the app in a cooldown;
Numeric or HTTP-date Retry-After values exposed in diagnostics are honored
(minimum 60s).
yt-dlp normally does not expose the server's HTTP response headers through
its CLI; absent that information the app cannot infer a server-specific
deadline and uses 60 seconds, with no automatic retry. Restarting the app
clears the in-memory wait.

Fresh checks: 11 native and 5 frontend tests, TypeScript and clippy passed.
A local HTTP fixture returning 429 to the bundled yt-dlp observed exactly
one request. A state test confirmed cooldown blocks both metadata and
download starts. No source-site throttling was deliberately induced.

### Independent engine updates

The titlebar's engine action checks the official stable GitHub release on
request. Updating and restoring the previous engine are explicit inline
actions. No automatic executable download runs at startup. Startup checks
that bundled Deno can actually start and evaluate JavaScript at version 2.3+.

Downloads remain HTTPS-only with certificate verification through Windows
Schannel. Redirects are restricted to GitHub's known release hosts, responses
have size/time limits, and the exact release's official SHA2-256SUMS is checked
before the candidate is executed. A successful version check precedes an
atomic active-version switch. Updates use versioned per-user data directories;
the bundled engine is never overwritten. The previous functional version is
retained and can be restored without network access. Cross-process file
locking prevents competing updater writes, and active app operations exclude
updates. Old version directories that are in use are left for later cleanup.

Uses reqwest (already present in the lockfile) with only native TLS enabled,
and SHA-256; no second TLS runtime, cookie store or browser credentials. Its
actual binary-size cost must be measured in the release build.

Fresh checks: 13 native unit tests passed, including checksum rejection,
path/version validation, atomic switching and fallback. A real isolated
test downloaded an officially verified older engine, checked/installed
2026.10.26, restored 2026.10.21 and confirmed the bundled fixture remained
byte-identical. Clippy passed with warnings denied. This does not constitute
a Windows installer upgrade test.

### Interrupted downloads

A repeat of the same URL, destination, format, resolution and bitrate within
the same app session reuses that operation's retained staging directory and
yt-dlp's documented continuation support. Other requests cannot reuse it.
Already completed compatible conversions are probed and reused. Incomplete
conversion outputs can be replaced only inside that owned staging directory;
their source input is retained until publication succeeds.

Recovery keys and continuation arguments have regression tests. The real
offline codec test also repeats the MP4 processing path and confirms that
the validated conversion's timestamp does not change. Reopening the app
does not automatically discover old staging directories; retained files can
be recovered manually using the path in error details. Explicit cancellation
cleans its staging; failed network/conversion operations preserve it.

Baseline figures above were measured in this run. Historical 0.1.0 checks are
recorded separately in VERIFICATION.md and are not fresh 0.1.1 results.
Clean Windows 10/11 installation, upgrade/uninstall and real player checks
remain required; no clean VM is currently established. Do not publish a claim
that these checks passed without running them.
