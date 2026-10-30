# Implementation notes

## Scope

A. Native foundation: Tauri 2, structured yt-dlp subprocesses, metadata, conversion, progress, cancellation and destination persistence.
B. Interface: one compact window, source preview, actual available qualities and recoverable states.
C. Identity: the supplied sun mask sampled into ordered points and extruded into front, rear and contour layers; a separate autonomous character field with wave displacement.
D. Delivery: regression checks, Windows installer, real media checks, measurements and English documentation.

There are no accounts, queues, history, playlists, telemetry, database or background service.

## Visual decisions

The current direction is **Monochromatic Optical Glass**. Flat translucent smoke fills, localized one-pixel reflections, internal shadows and contact shadows define the controls. There are no broad fill gradients, colored glows or added UI libraries. Four material variants distinguish primary actions, controls, secondary surfaces and floating content. The URL arrow is unboxed. The original sun artwork replaces the URL chain icon as a small CSS alpha mask.

The transparent 36px titlebar contains only minimize, maximize/restore and close. The existing Tauri drag region and native window handlers remain. There is no corner brand or engine-update UI. Windows' native hover Snap Layouts flyout remains outside the custom titlebar's existing capabilities.

Metadata loading has only a one-pixel traveling reflection within the input's lower edge. A clipped live region announces the operation without visible copy or a spinner. Download transfers show real percentages in a compact surface with a two-pixel inner rail. Post-processing has its own status without a percentage or a transfer rail. Completion removes the progress surface.

Thumbnails use their natural aspect ratio and retain their complete image. A 16:9 fallback is used before the image arrives. Portrait previews have a bounded viewport-relative height without letterboxing or cropping. The centered composition grows from 448–480px in compact windows to 560–600px in medium windows and 740px in large windows. Short windows use tighter spacing; the main pane scrolls when needed. Metadata results expand and fade in, and collapse/fade out when the URL is cleared. Reversible grid transitions coordinate the emblem and source position over 280ms. Format selection uses a 200ms sliding optical inset, 160ms quality feedback and a reversible audio-hint expansion. Reduced motion removes these transitions.

Ten activations of the central emblem toggle a hidden chromatic mode; ten more return to monochrome. A registered CSS angle cycles continuously through the color wheel over 80 seconds. Canvas color treatment and restrained control accents cycle smoothly. The URL sun remains white and unfiltered at the user's request. Thumbnails remain unchanged. Reduced motion freezes the color cycle and removes transition motion. No state is persisted.

## Rendering

The character field retains the original folded sheets, currents, voids and waves. Slow changes in sheet orientation, fold width and crossing-current phase add variety without altering glyph size or density; GPU and Canvas paths use the same equations. The old 1000px bitmap cap caused enlarged glyphs at large window sizes. Positions and glyph sizes now remain in CSS pixels, while the backing store follows physical dimensions with DPR capped at 2. Larger windows reveal more of the field instead of magnifying it.

A small WebGL 2 point renderer computes field geometry in a vertex shader and samples a glyph atlas in one draw call. Positions and atlas data upload only on resize. The pixel-buffer Canvas implementation remains as a fallback, with DPR capped at 1.25 on that slower path. Context restoration recreates GPU resources. The emblem continues to use the original point map, physical depth and subpixel coverage in its own 360px Canvas buffer. The emblem rotates continuously to the right around Y, with a gentle pitch sway, following the user's updated motion request. It sits 28px higher in the initial screen and retains titlebar clearance in the loaded state.

The loop is capped at 30 FPS; field cadence adapts between 12 and 24 FPS. Document visibility and reduced-motion signals stop animation. Color mode uses CSS compositing only when explicitly activated. No external dependency or extra WebGL context for controls is added.

See [the visual verification report](OPTICAL-GLASS.md) for evidence and limits. Earlier release verification documents describe their respective historical builds.

## Engine strategy

Pinned Windows x64 engines are bundled at build time. Official yt-dlp and Deno archive hashes are committed in scripts/engine-manifest.json. FFmpeg uses verified official source and pinned Microsoft vcpkg recipes. Shared DLLs reduce duplication between FFmpeg and FFprobe.

In 0.1.1, yt-dlp also has an explicit stable-release updater with official HTTPS origin, SHA-256 checks, versioned per-user executables, an atomic active-version switch and rollback. Bundled Deno remains explicit and does not depend on PATH. FFmpeg 9.0.2 is built as compact shared DLLs using pinned vcpkg source recipes; no build tools ship. See UPDATE-0.1.1.md, THIRD_PARTY_NOTICES.md and licenses/SOURCES.md.

Subprocesses receive structured arguments without a shell. User yt-dlp configuration and plugin discovery are disabled. URLs and selected qualities are checked in Rust. Output is explicitly UTF-8: Windows' default process-output encoding can omit characters such as the fullwidth separators in sanitized titles, producing a path that does not match the real file.

Downloads use owned staging directories inside the destination. Identical in-session retries can reuse a retained directory. Canonical output paths must remain inside that operation's staging folder. FFprobe gates publication on actual codecs, container, duration and size. Compatible MP4 converts only incompatible tracks, and Windows moves never replace an existing file, including on FAT/exFAT destinations. Cleanup is restricted to owned directories; failed operations retain recoverable inputs.

Each subprocess belongs to a Windows Job Object with kill-on-close behavior, so cancellation and application exit also terminate FFmpeg/Deno descendants. Metadata requests are versioned; obsolete results cannot replace the current selection. Repeated submission of the same in-flight URL does not launch another query.

## Validation

See OPTICAL-GLASS.md for current interface checks. VERIFICATION.md and UPDATE-0.1.1.md contain historical release and engine evidence.
