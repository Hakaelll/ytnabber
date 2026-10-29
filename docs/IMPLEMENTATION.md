# Implementation notes

## Scope

A. Native foundation: Tauri 2, structured yt-dlp subprocesses, metadata, conversion, progress, cancellation and destination persistence.
B. Interface: one compact window, source preview, actual available qualities and recoverable states.
C. Identity: the supplied sun mask sampled into ordered points and extruded into front, rear and contour layers; a separate autonomous character field with wave displacement.
D. Delivery: regression checks, Windows installer, real media checks, measurements and English documentation.

There are no accounts, queues, history, playlists, telemetry, database or background service.

## Visual decisions

The Graphite reference supplies the monochrome palette and compact Windows system typography. Later feedback adds a restrained glass material on the URL control and simpler dark controls, an off-white Download button and selected format, and a dark quality picker.

At 560 × 680, the title bar is 42px. A centered 164px point emblem becomes a 58px emblem when metadata arrives. The source thumbnail is letterboxed without cropping its aspect ratio. The title, formats, actual video heights, destination and one Download action remain in the same scrollable window.

The native customizable select preserves browser keyboard and accessibility behavior. Its picker is anchored below the trigger with no upward fallback and an available-height limit. Older runtimes receive explicit dark option colors. Errors and completion are inline messages; real download progress uses a simple two-pixel line. Metadata fetching has a restrained orbital indicator and moving input-edge reflection. Removed explanatory footer copy stays absent.

The emblem rotates to the right with physical thickness and depth lighting; the original artwork is not mirrored or replaced. The denser background has warped typographic sheets, currents, voids and blue-gray wave deformation. It never reacts to the mouse.

## Rendering

Both canvases use batched pixel buffers. Glyph coverage and color combinations are prepared once. The emblem uses bilinear coverage for smooth compact projection. The slow field updates independently at a lower cadence; the animation loop is capped at 25 FPS. Internal resolution and glyph count are bounded. Hidden-document and reduced-motion signals stop the animation. Reduced transparency and high contrast produce solid control surfaces.

## Engine strategy

Pinned Windows x64 executables are bundled at build time. SHA-256 values from the official upstream GitHub release assets are committed in scripts/engine-manifest.json. FFmpeg is BtbN's LGPL shared build, linked by ffmpeg.org. Shared DLLs reduce duplication between ffmpeg and ffprobe.

No updater, runtime component download, PATH dependency or administrator configuration is added. yt-dlp's official executable includes matching EJS scripts; its bundled Deno is selected explicitly. See THIRD_PARTY_NOTICES.md and licenses/SOURCES.md.

Subprocesses receive structured arguments without a shell. User yt-dlp configuration and plugin discovery are disabled. URLs and selected qualities are checked in Rust. Output is explicitly UTF-8: Windows' default process-output encoding can omit characters such as the fullwidth separators in sanitized titles, producing a path that does not match the real file.

Downloads use newly created staging directories inside the destination. Canonical output paths must remain inside that operation's staging folder. Windows moves publish a complete file without replacing an existing one, including on FAT/exFAT destinations. Cleanup is restricted to a directory successfully created by that operation.

Each subprocess belongs to a Windows Job Object with kill-on-close behavior, so cancellation and application exit also terminate FFmpeg/Deno descendants. Metadata requests are versioned; obsolete results cannot replace the current selection. Repeated submission of the same in-flight URL does not launch another query.

## Validation

See VERIFICATION.md for passing checks, measured resource usage, YouTube verification results and source-availability limits.
