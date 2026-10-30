# 0.1.1 engineering audit and release work

## Final release result

Windows x64 installer generated successfully. Application/package/Cargo/NSIS
metadata is 0.1.1. Automated checks and actual engine downloads/conversions
passed. Clean-machine installation and manual UI/player checks remain pending;
this is not a claim of full Windows 10/11 certification.

| Measured component | 0.1.0 MiB | 0.1.1 MiB | Change |
| --- | ---: | ---: | ---: |
| Downloadable NSIS installer | 103.89 | 64.06 | -38.34% |
| Application payload | 278.98 | 154.47 | -44.63% |
| All engine resources | 271.24 | 145.82 | -46.24% |
| FFmpeg/FFprobe binaries and their DLLs | 155.21 | 29.67 | -80.89% |
| Deno | 93.54 | 93.54 | unchanged |
| yt-dlp | 22.48 | 22.48 | unchanged |
| Native executable with embedded frontend | 7.46 | 8.36 | +12.05% |
| Central licenses and notices | 0.28 | 0.30 | +6.74% |

Installer reduction: **41,771,708 bytes (39.84 MiB)**. Application payload
reduction: **130,554,594 bytes (124.51 MiB)**. The native executable grew
0.90 MiB with the functional/update changes; the overall package still
shrunk substantially. This is a reduction of real uncompressed engine code,
not just a different installer compression setting.

Raw byte inventories: [before](size-0.1.0.json), [after](size-0.1.1.json).
`npm run size:release` reproduces the measurement. Payload means application
files, verified against the extracted installer; it excludes the generated
uninstaller, shortcuts/registry, shared WebView2, filesystem allocation and
user data. An actual installed-directory measurement on a clean VM is pending.

The largest remaining files are Deno (93.54 MiB), yt-dlp (22.48), avcodec
(15.19), the native executable (8.36), avfilter (4.05), avformat (2.69),
dav1d (1.90), swscale (1.21), avutil (1.10) and OpenH264 (0.92).
The JSON inventory records the exact bytes for each, including every smaller
DLL, license and configuration file. Graphic originals remain 1.13 MiB and
are embedded in the frontend; they must not be added to the native size a
second time. Fonts use Windows system fonts; animations are code/point data.

### Why FFmpeg is smaller

The stock BtbN build included numerous external GPU, filter, image and video
encoding libraries that YTNabber never calls. The pinned compact LGPL 2.1+
shared build retains native demuxers/decoders, H.264/AAC/MP3/Opus operations,
AV1 through dav1d, VP8/VP9, HTTPS through Schannel, resampling/scaling and
native device inputs including lavfi. It omits FFplay and the unexposed
external library collection. FFmpeg and FFprobe still share their DLLs.
No required core operation was replaced by an experimental implementation.
Source hashes, patches, licenses and the repeatable recipe accompany the
project; no compiler, test data, PDB or source cache ships to users.

The first compact trial omitted avdevice/lavfi: two fixture-generation tests
failed with `Unknown input format: lavfi`. It was corrected by adding the
199,168-byte native device DLL, then the affected tests passed. This failure
was not hidden or counted as a successful verification.

### Final architecture

The existing TypeScript interface calls asynchronous Rust commands through
Tauri IPC. Rust selects the bundled or explicitly updated official yt-dlp
executable. It always passes absolute paths to bundled Deno and FFmpeg;
yt-dlp's official executable includes matching EJS scripts and Python.
Deno is retained with upstream restricted EJS permissions, not replaced by
an unrestricted smaller runtime. See [the runtime study](RUNTIMES.md).

yt-dlp downloads/extracts/remuxes into owned staging. Rust probes the real
result with FFprobe. For compatible MP4, only incompatible tracks are
recoded; supported H.264 8-bit 4:2:0/AAC tracks are copied. Original codecs
remain an explicit high-quality choice. A verified complete file is then
published without replacing an existing file. Windows Job Objects cover
yt-dlp/Deno/FFmpeg descendants and cancellation.

| Choice | Actual final media policy |
| --- | --- |
| Compatible MP4 | H.264 8-bit 4:2:0, AAC if audio exists; retain resolution; convert only necessary tracks |
| Original-codec MP4 | Preserve selected best source codecs; remux when needed; player support may vary |
| MP3 | Real MP3 conversion, default 192 kbps target; configurable conversion bitrate; retain matching MP3 and cover art |
| M4A | Prefer AAC, otherwise convert; reject mislabeled Opus |
| Opus | Explicit choice, retain Opus or genuinely convert when necessary |

### Verification performed

| Check | Actual result |
| --- | --- |
| Native unit tests | 16 passed |
| Frontend/build-inventory tests | 6 passed |
| TypeScript, formatting, clippy including test targets | Passed; warnings denied |
| Production frontend/native/NSIS build | Passed |
| Final engine integration group | 7 passed, sequentially, with system tools removed from PATH and resources under a Unicode path containing spaces |
| 720p/1080p local fixtures | Exact selection, H.264/AAC verified; compatible tracks not transcoded again |
| Real public 720p/1080p downloads | Two-second Big Buck Bunny samples downloaded using engines extracted from the actual installer; both probed and fully decoded |
| Real Deno/EJS | Bundled Deno recognized and actual EJS solving asserted during a complete public YouTube reference download; same pinned yt-dlp/Deno binaries as the final package |
| MP3/M4A/Opus and VP9/Opus conversion | Real outputs, FFprobe and complete decoding passed; cached conversion reuse and MP3 cover art checked |
| Cancellation | Active transfer and live FFmpeg conversion cancelled; files unlocked for cleanup |
| Interrupted download | With the final installer engines and isolated PATH, a persisted 32 KiB partial resumed; completed bytes matched the original downloaded MP4 exactly |
| Error cases | Missing tools, corrupt input, processing failure, HTTP 404, HTTP 429, format mismatch and file protection covered |
| Rate limit | Local server observed exactly one request on 429; state tests enforce cooldown |
| Updater | Official 2026.10.21 to 2026.10.26 update and rollback passed in isolation; original bundled fixture byte-identical |
| Distribution integrity | All 35 application payload files checked against the extracted NSIS installer; engine checksums matched |
| Native bundle marker | Tauri changes only `BUNDLE_TYPE_VAR_UNK` to `BUNDLE_TYPE_VAR_NSS` in the packaged executable; remaining bytes match the build output |
| Visual identity sources | Artwork, icons, graphics/animation code and emblem point data unchanged; the remote titlebar/glass refinements were preserved during final integration |

The public HD source is Blender Foundation's
[Big Buck Bunny reference](https://www.youtube.com/watch?v=aqz-KE-bpKQ).
Only short samples were downloaded for the HD check, not the complete film.
The additional resume fixture initially failed because small cancelled
transfers remained buffered in Python, then because informational messages
were suppressed or read from stderr only. The corrected fixture seeds a
known persisted prefix and explicitly checks stdout/stderr plus byte identity.
It does not claim that every cancelled small transfer has already flushed
downloaded bytes to disk. The complete corrected transfer/conversion/cancel/
resume/404 test passed using the final extracted installer engines.
The short YouTube reference is `jNQXAC9IVRw`; direct-media checks use the
public W3Schools `mov_bbb.mp4`. Tests do not use accounts, cookies or external
PO-token providers and are run sequentially. The Windows compatible pixel
format policy follows the [Media Foundation H.264 decoder constraints](https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-decoder).

### External runtime, auxiliary and temporary storage

- WebView2 is shared, not bundled or duplicated by YTNabber. The current host's
  installed WebView2 156.0.4314.50 directory measures 914,606,303 bytes
  (872.24 MiB, 919 files). This is an existing system component, not part of
  the 64.06 MiB installer or 154.47 MiB app payload. A clean Windows system
  without WebView2 needs Microsoft's runtime, downloaded by the unchanged
  bootstrapper strategy; its size/version can vary.
- A controlled `yt-dlp --version` run with an isolated TEMP observed a peak
  of 30,749,168 extracted bytes (29.32 MiB, 142 files). Exit code was zero
  and no temporary files remained. This is a measured bootstrap sample,
  not a peak for every download or video size.
- Media staging can hold source and converted output concurrently. Success
  and explicit cancellation clean it; failures retain recoverable files.
  Exact media/temp usage depends on the selected content.
- Explicit engine updates retain current/previous dated executables in
  per-user data in addition to the bundled fallback. Files in use can defer
  old-cache cleanup. This rollback storage is separate from the app payload.
- Developer source/build/download caches are excluded from NSIS. Their
  growth while compiling FFmpeg is not an installed-app size increase.

### Installer and pending verification

Artifact: `src-tauri/target/release/bundle/nsis/ytnabber_0.1.1_x64-setup.exe`.
Exact size: **67,169,936 bytes**.

SHA-256:
`713e04b87921bc1d706de1ebcf710a2af6d32c36124a8dcc9352f77273419463`.

NSIS remains per-user with the existing icon, template/configuration,
shortcuts and uninstall behavior. Its generated file list contains only
application resources, licenses and required installer plugins. No source,
test fixture, Node modules, PDB or build cache is included. Resource extraction
and DLL imports were checked; there is no new Visual C++ redistributable
requirement beyond the Windows system runtime.

Still pending:

- Clean Windows 10 and Windows 11 installation with no manually installed
  yt-dlp/Python/Deno/FFmpeg. Windows Sandbox, VirtualBox, VMware and Hyper-V
  tooling were not available in this environment. PATH isolation passed but
  is not a substitute for this test.
- Actual installer installation, upgrade, shortcut behavior and uninstall
  on that clean environment; the NSIS script/resources were inspected only.
- Manual visual/animation and physical Windows player checks. Computer Use
  was stopped at the user's instruction and no further UI automation was used.
- The installer is unsigned. Source restrictions and future extractor/runtime
  changes can still require an engine rollback or a later app/dependency update.
  Candidate update validation checks integrity and startup/version, not every
  source site's future compatibility.
- In-session resume is supported; restart/crash recovery remains manual.
  Server-specific Retry-After headers not exposed by yt-dlp's CLI cannot be
  inferred; absent an exposed value the app uses a 60-second cooldown and
  does not retry automatically.

Standards/spec review was performed in the current agent against `82db38b`
and the supplied update prompt. It caught the lavfi omission, 10-bit H.264
compatibility and cover-art classification issues; each was corrected with
focused checks. No framework migration, account integration, telemetry or
visual redesign was introduced by this engine/size update. The independent
remote commits `24ee86d` and `a3ac03f` were merged without conflicts and their
titlebar/glass refinements retained; the installer was then rebuilt. Their
historical browser verification is recorded separately in VERIFICATION.md;
no browser or native UI automation was run during this final integration.

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
