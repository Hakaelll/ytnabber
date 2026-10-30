# Monochromatic Optical Glass — verification

Date: 2026-10-30. This report covers the current local visual implementation, including the later requests to remove engine-update controls, use the sun in the URL field, and add the ten-press color easter egg.

## Audit and causes

| Area | Previous implementation and cause | Current implementation |
| --- | --- | --- |
| Interface | One TypeScript DOM template and one stylesheet; individual controls overrode the shared material. | Existing architecture retained; shared smoke, edge, radius, shadow and motion tokens with four material variants. |
| Loading | Visible metadata copy, three bars, an orbit and an input scan were all present. | Old nodes and styles removed; only a one-pixel reflection within the URL input edge. A clipped live region retains announcements. |
| Thumbnail | Fixed 153/190px heights with a wide frame and `object-fit: contain` created side bands. | Frame follows the loaded image's natural ratio. Default 16:9; portrait height is bounded without cropping. |
| Background | A 1000px-wide buffer was stretched across larger windows. Count and spacing depended on that reduced buffer. | Fixed CSS glyph size/spacing, physical framebuffer dimensions, DPR cap 2 and a single GPU point draw. |
| Emblem | The first visual pass used a bounded yaw oscillation. | At the user's request, continuous rightward Y rotation is restored, with gentle pitch sway and a higher idle position. Original point map, subpixel coverage and the 360px buffer remain. |
| Layout | A fixed 448px maximum width and top margins made maximized content look small. | Centered composition grows to 560–600px and 740px; short windows tighten spacing and retain scrolling. |
| Titlebar | Repeated corner logo/name plus engine action. | Only three window controls; existing drag region and native event handlers retained. Engine-update UI removed at the user's request. |
| Progress | Thick transfer rail and the same indeterminate treatment during post-processing. | Two-pixel inner transfer rail with real percentage, separate processing status, compact completion and retained cancel/error actions. |
| Glass | Tinted gray fills and broad gradients, inconsistent override values. | Flat smoke fills, localized masked rim reflections, inner meniscus and contact shadows; selective background softness/contrast. |

The control material approximates optical separation through transmission, rim lighting and local contrast. It does not claim a physically accurate refraction simulation. Extra displacement shaders on controls were not added. The GPU work is restricted to the character field, where measured CPU cost justified it. No dependencies or external services were introduced.

Visual calibration references: [Apple material guidance](https://developer.apple.com/design/human-interface-guidelines/materials) and [Linear's interface redesign](https://linear.app/now/how-we-redesigned-the-linear-ui). The supplied monochrome identity takes precedence over either reference.

## Evidence

`tests/titlebar.browser.mjs` runs the real frontend in headless Microsoft Edge with Tauri commands/events mocked. Geometry and visuals are rendered, not inferred from CSS. The fixture is local and deterministic; a second run used the downloaded 1280×720 Big Buck Bunny thumbnail through `THUMBNAIL_FIXTURE`.

Reference sizes: 560×680, 1280×800, 1920×1080 and 2560×1440 at DPR 1. Compact and 1920px layouts also run at DPR 1.5 and 2. A 430×630 portrait-image case checks controlled scrolling.

Checks include:

- Initial, metadata loading, loaded video, starting, determined progress, processing, success, error and open quality picker screenshots.
- No visible legacy metadata indicator, corner branding or engine-update control.
- Stable input bounds while metadata is pending; natural thumbnail/frame geometry; Download reachable in reference viewports.
- Quality picker flips/scrolls within the viewport; original format/quality names and destination selection remain.
- Actual progress event values at 0%, 43.7% and 100%; no percentage during processing; cancel and subsequent download reset.
- Window command IPC and maximize/restore accessible labels; keyboard interactions; reduced motion, increased contrast and forced colors.
- WebGL error state, context loss/restoration, and the Canvas-only fallback at DPR 2 (physical DPR capped at 1.25 on that path).
- Exactly ten emblem activations enable color mode; another ten keyboard activations disable it. Hue advances continuously. The URL sun stays white and unfiltered throughout the cycle, following the user's final preference. Thumbnail pixels are not filtered.

Screenshots and raw measurements are in the ignored `artifacts/optical/` directory. Representative files are `ready-560-1x.png`, `ready-1920-1x.png`, `loading-560-1x.png`, `progress-560-1x.png`, `quality-560-1x.png` and `chromatic-32000-560-1x.png`.

## Checks and measurements

- TypeScript check and production Vite build passed.
- Six Node tests passed.
- Sixteen native unit tests passed; ten opt-in integration tests are skipped by the normal native suite.
- The offline real-engine conversion test passed separately using the prepared production engines: compatible MP4, original-codec MP4, MP3, M4A and Opus were validated and fully decoded. MP3 cover art was preserved.
- Rust formatting and diff whitespace checks passed.
- Production engine manifest, FFmpeg recipe and every engine resource checksum passed verification. The desktop checkout initially had stale prepared engines; the already-built matching resources from the other local checkout were verified before copying. The previous resources remain under `.cache/engines-before-optical/`.
- The isolated five-second render sample at 2560×1440/DPR 2 measured roughly 1.3ms p95 for main-thread RAF callbacks in monochrome and 1.6ms in color mode. This measures JS callbacks, not GPU completion time or physical display FPS. The previous CPU buffer path reached approximately 152ms p95 in the same large-window case.

The sandboxed Vite config bundler could not traverse the Desktop parent directory. The existing Vite runner loader worked; no project build setting was changed. The local Tauri build override in `.cache/optical-build.json` uses that loader while preserving production engine verification.

## Limits

Desktop window gestures, native dialogs, a new full YouTube download, clean-machine installation and installer upgrade/uninstall were not manually exercised in this run. Desktop control was not used after the user requested that restriction. Browser IPC checks do not prove native window-manager behavior. The local native unit and offline engine checks are distinct from the simulated UI operation states.

The Canvas-only renderer deliberately uses a lower physical DPR budget. Older WebView2 versions without customizable select support retain their native dark picker. No new native Snap Layouts hover implementation was added.

## Local delivery

The final production Tauri/NSIS build passed. Installer: src-tauri/target/release/bundle/nsis/ytnabber_0.1.1_x64-setup.exe (67179988 bytes, 64.07 MiB). SHA-256: 741b79b4f3650b6ffaae59e925eb3a3ea5277b260302a4db9867251f9e39ce44. This build includes the continuous rightward emblem rotation, final higher idle position, reversible preview/format transitions, varied background currents, always-white URL sun and ten-press color mode. The installer was generated but not installed in this run.

## Motion follow-up

The emblem now sits 28px above its original idle position and makes continuous rightward Y turns rather than reversing yaw. A small pitch sway adds forward/back motion. New 280ms grid/opacity transitions coordinate preview entry and exit, including clearing a URL while a previous transition is still running. A 200ms inset slides between formats; quality uses 160ms opacity feedback and the audio hint expands/collapses over 240ms. All motion respects reduced-motion preferences.

The folded-character background now varies sheet angle, fold breadth and crossing-current phase slowly. Glyph dimensions, density, palette and resource/visibility handling are unchanged. GPU and Canvas equations remain aligned. Time samples at 0, 30, 60 and 90 seconds are saved under `artifacts/motion/`.

Motion follow-up checks passed in the four reference sizes and at DPR 1/1.5/2. Entry, exit on URL clearing, sliding format selection, quality feedback and reduced-motion behavior were exercised. A rapid clear/reload correctly reverses the pending transition. The emblem was sampled through a complete turn; background samples rendered without WebGL errors. The final README was shortened and updated for this release.
