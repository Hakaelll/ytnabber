# Implementation notes

## Scope

A. Native foundation: Tauri 2, structured yt-dlp subprocesses, metadata, conversion, progress, cancellation and destination persistence.
B. Interface: one compact window, source preview, actual available qualities and recoverable states.
C. Identity: the supplied sun mask sampled into ordered points and extruded into front, rear and contour layers; a separate autonomous character field with wave displacement.
D. Delivery: regression checks, Windows installer, real media checks, measurements and English documentation.

There are no accounts, queues, history, playlists, telemetry, database or background service.

## Visual decisions

The Graphite reference supplies the monochrome palette and compact Windows system typography. The URL field, Download button and active transfer share a restrained smoked-glass material. The selected format stays off-white, and the quality picker stays dark.

At 560 × 680, the title bar is 36px. It has no separate fill or divider: the existing character field continues behind the compact logo, wordmark and window controls. Thin geometric icons have a subtle smoked-glass surface only on hover or press, with an inset keyboard focus indicator. High contrast and reduced transparency restore a solid surface. The source field is 50px tall with a single delicate border and an unboxed arrow; overlapping bright fill/rim gradients were removed. During transfer, progress, speed and cancellation occupy one compact glass surface in place of the Download button. A centered 164px point emblem becomes a 58px emblem when metadata arrives. The source thumbnail is letterboxed without cropping its aspect ratio. The title, formats, actual video heights, destination and one Download action remain in the same scrollable window.

The title bar uses [Tauri's custom titlebar mechanism](https://v2.tauri.app/learn/window-customization/): `data-tauri-drag-region` handles dragging and double-click maximization, with `app-region: drag` for Windows touch and pen support. Controls opt out of the drag region. Resize events synchronize the maximize/restore icon and accessible label, including changes initiated outside the button. Resizability, window constraints and close-time job cancellation remain in the existing native configuration and handlers. The custom maximize button does not implement Windows 11's native hover Snap Layouts flyout; window snapping remains delegated to Windows and Tauri.

The native customizable select preserves browser keyboard and accessibility behavior. Its picker is anchored below the trigger with no upward fallback and an available-height limit. Older runtimes receive explicit dark option colors. Errors and completion are inline messages; real download progress uses a simple two-pixel line. Metadata fetching has a restrained orbital indicator and moving input-edge reflection. Removed explanatory footer copy stays absent.

The emblem rotates to the right with physical thickness and depth lighting; the original artwork is not mirrored or replaced. The denser background has warped typographic sheets, currents, voids and blue-gray wave deformation. It never reacts to the mouse.

## Rendering

Both canvases use batched pixel buffers. Glyph coverage and color combinations are prepared once. The emblem uses bilinear coverage for smooth compact projection. The slow field updates independently at a lower cadence; the animation loop is capped at 25 FPS. Internal resolution and glyph count are bounded. Hidden-document and reduced-motion signals stop the animation. Reduced transparency and high contrast produce solid control surfaces.

## Engine strategy

Pinned Windows x64 engines are bundled at build time. Official yt-dlp and Deno archive hashes are committed in scripts/engine-manifest.json. FFmpeg uses verified official source and pinned Microsoft vcpkg recipes. Shared DLLs reduce duplication between FFmpeg and FFprobe.

In 0.1.1, yt-dlp also has an explicit stable-release updater with official HTTPS origin, SHA-256 checks, versioned per-user executables, an atomic active-version switch and rollback. Bundled Deno remains explicit and does not depend on PATH. FFmpeg 9.0.2 is built as compact shared DLLs using pinned vcpkg source recipes; no build tools ship. See UPDATE-0.1.1.md, THIRD_PARTY_NOTICES.md and licenses/SOURCES.md.

Subprocesses receive structured arguments without a shell. User yt-dlp configuration and plugin discovery are disabled. URLs and selected qualities are checked in Rust. Output is explicitly UTF-8: Windows' default process-output encoding can omit characters such as the fullwidth separators in sanitized titles, producing a path that does not match the real file.

Downloads use owned staging directories inside the destination. Identical in-session retries can reuse a retained directory. Canonical output paths must remain inside that operation's staging folder. FFprobe gates publication on actual codecs, container, duration and size. Compatible MP4 converts only incompatible tracks, and Windows moves never replace an existing file, including on FAT/exFAT destinations. Cleanup is restricted to owned directories; failed operations retain recoverable inputs.

Each subprocess belongs to a Windows Job Object with kill-on-close behavior, so cancellation and application exit also terminate FFmpeg/Deno descendants. Metadata requests are versioned; obsolete results cannot replace the current selection. Repeated submission of the same in-flight URL does not launch another query.

## Validation

See VERIFICATION.md for passing checks, measured resource usage, YouTube verification results and source-availability limits.
