# Release verification — 0.1.0

Verified on 29 October 2026 in the project's Windows x64 development environment.

## Titlebar redesign checks

The transparent 40px titlebar was checked separately after the original release verification below:

- `npm test`: 5 passed after integrating the latest remote changes.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 14 passed, 9 opt-in engine/network tests ignored after integration.
- `npm run build`: TypeScript and production assets passed.
- `tests/titlebar.browser.mjs`: passed in headless Edge at device scales 1, 1.5 and 2. It checks a continuous animated character field behind the transparent titlebar, no divider, aligned logo/control centers, hover and pressed states, minimize/maximize/close IPC, maximize/restore icon and accessible label synchronization on resize, keyboard activation/focus, compact layout, reduced motion, increased contrast and forced colors. Tauri IPC and events are mocked; this is not a native Windows interaction test.
- Before integrating the remote engine/format additions, the existing complete UI check passed for animation, metadata, formats, destination, progress, processing, cancellation, success and compact layout. The titlebar check and frontend/native suites above were repeated after integration.

To repeat the titlebar check, start `npm run dev`, make an existing Playwright installation resolvable (or set `PLAYWRIGHT_MODULE` to its module path), then run `node tests/titlebar.browser.mjs`. Microsoft Edge must be installed. The check saves screenshots under the ignored `artifacts/` directory; it adds no application dependency.

Native drag, double-click, edge resizing, physical multi-monitor DPI changes and Windows snapping were not interactively verified for this change: the user requested no Computer Use. The existing Tauri window configuration is unchanged, and drag/double-click handling now uses the framework's documented mechanism. No new installer or GitHub release was published for this source change.

## Results

| Check | Evidence |
| --- | --- |
| TypeScript and production frontend | npm run build passed; Vite emitted the production assets. |
| Frontend regression tests | 4 tests passed with npm test. |
| Native unit tests | 7 passed; opt-in network tests are intentionally ignored by the default command. The initial release had 3; a fourth conversion-cancellation check was added afterward. |
| Native warnings and formatting | cargo clippy -- -D warnings and cargo fmt -- --check passed. |
| Direct MP4 download | A real 788,493-byte MP4 was downloaded and inspected with the bundled ffprobe. |
| MP3 conversion | A real 296,372-byte audio-only MP3 was produced and probed. |
| M4A extraction | A real 204,490-byte audio-only AAC/M4A was produced and probed. |
| Progress and conversion | Integration checks observed actual transfer events and separate indeterminate processing events. |
| Cancellation | An active rate-limited transfer was cancelled in about 2.6 seconds, without a final MP4 being published. |
| Cancellation during conversion | A later real-engine check cancelled FFmpeg after it had begun writing an MP3, then successfully removed the unlocked partial files. |
| Missing source | A public HTTP 404 source returned a recoverable failure. |
| Existing file protection | Native tests confirmed the existing file remained unchanged. |
| Windows filename regression | The actual failure was reproduced with a fullwidth separator. Forcing UTF-8 fixed it; the test also passes with an accented destination and title. |
| Reported YouTube video | The exact 25-second clip from the screenshot downloaded at 1080p with both streams, retained its Unicode filename, and passed full-file decoding. |
| Metadata replacement | Tests confirm a stale operation cannot cancel or remove a newer one. |
| Interface states | A headless Edge check using Tauri's official IPC mocks covered loading, metadata, available qualities, audio/video switching, folder changes, progress, processing, cancellation, success and error recovery. |
| Selector | The quality picker was opened and its first option was verified to appear below the trigger. It scrolls within the space remaining below the control. |
| Animation | Canvas pixels changed while running and stopped under reduced motion. Removed interface copy was checked absent. |
| Compact layout | 560 × 680 and 430 × 630 views were rendered without horizontal overflow. Messages are scrolled into view when needed. |
| Native launch | The optimized executable opened and remained running with its WebView2 process tree. |
| Windows installer | Tauri successfully generated the x64 NSIS installer. Its generated script includes the four engines, FFmpeg DLLs, licenses and source information. |

The local engine checks use https://www.w3schools.com/html/mov_bbb.mp4. The public YouTube check uses https://www.youtube.com/watch?v=jNQXAC9IVRw.

## YouTube verification and intermittent source checks

Earlier in this session, the real YouTube integration check successfully read the title, duration, thumbnail and formats, downloaded a 144p video track plus a separate audio track, merged them, and verified both streams with ffprobe.

Later, YouTube started returning **“Sign in to confirm you're not a bot”** for that video and another public video. The same result occurs when invoking the bundled executable directly, outside the app. A SHA-256-verified official yt-dlp nightly was checked separately and returned the same response. The shipped engine remains the pinned stable release.

A later recheck of the exact native YouTube integration test passed again: separate 144p video and audio tracks were downloaded, merged and verified with ffprobe.

The specific video from the reported failure was then verified as well: "VERBAL ALTERCATION | Alexander Volkanovski and Max Holloway Backstage at UFC 276" (K3GT-IO4eNM). The current engine arguments produced an 8,026,552-byte MP4 with 1080p VP9 video and Opus audio. The returned Windows filename retained its fullwidth separator and matched the real file. FFmpeg successfully decoded the complete file. Generated verification media was removed afterward.

This demonstrates that the source block was intermittent, while the Unicode-path correction is independently covered by a deterministic direct-media regression. The interface distinguishes source verification blocks from private or unavailable videos and suppresses duplicate in-flight lookups. The app does not import browser cookies, log in, or attempt access-restriction workarounds. Source sites can still request verification again; permanent availability cannot be guaranteed.

## Measurements

The optimized application was launched from an isolated copy so the measurement did not lock the installer build input. The native process and its WebView2 descendants were sampled for 10 seconds after a six-second warm-up.

| Measurement | Result |
| --- | --- |
| Native executable | 7.46 MiB |
| Bundled media engines and DLLs | 271.24 MiB |
| Compressed Windows installer | 103.89 MiB |
| Native + WebView2 processes | 7 |
| Sum of working sets | 370.4 MiB |
| CPU across the app process tree | 68.34% of one logical processor; 5.69% of this 12-logical-processor machine |
| Frontend JavaScript heap, separate headless sample | About 6.8 MiB |
| Recorded animation callback mean / 95th percentile, separate headless sample | About 4.0 ms / 13.7 ms |

Working-set sums can count shared pages more than once. These are short single-machine samples, not cross-device guarantees. No download/conversion engine is resident while idle; yt-dlp, Deno and FFmpeg run only for an operation.

The first dense version used thousands of individual Canvas drawing calls and measured 154.38% of one logical processor on the same machine. Batched pixel buffers, precomputed glyph coverage, bounded logical resolution and a lower update cadence for the slow field reduced the measured app-tree CPU to 68.34% of one logical processor. The emblem keeps its independent capped animation cadence. The appearance and character density were retained.

## Limits of verification

- A separate physical Windows 10 machine was not available.
- The generated installer was built and its packaged file list inspected; a clean-machine installation/uninstallation was not performed.
- Actual disk exhaustion, a disconnected external drive and every source website were not simulated.
- Folder selection and Explorer opening were checked through their native command implementation and the interface workflow; no automated control of the user's Explorer was performed.
- Reduced-motion and hidden-document handling are implemented; physical minimize/restore across different Windows/GPU combinations was not exhaustively benchmarked.
- The installer is unsigned.
