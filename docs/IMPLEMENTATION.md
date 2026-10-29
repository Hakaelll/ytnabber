# Implementation notes

## Scope and checkpoints

A. Native foundation: Tauri 2, structured yt-dlp subprocesses, metadata, conversion, progress, cancellation, destination persistence.
B. Interface: one compact Graphite window, source preview, actual available qualities, accessible controls and error recovery.
C. Identity: supplied sun emblem sampled into points and projected in 3D; separate low-frequency character field with physical wave displacement.
D. Delivery: regression checks, Windows build, real media smoke tests, resource measurements and English documentation.

No accounts, queues, history, playlists, telemetry, database or background service.

## Visual decisions

Canvas #0a0a0a, recessed black, surface #171717, border #262626, active border #464646, text #fafafa, secondary #a1a1a1 and restrained blue-gray waves. Segoe UI Variable / Segoe UI uses the Windows system font without a font download. Controls use 4–6px corners and 1px borders.

At 560 × 680, the title bar is 42px. A centered 154px emblem and narrow URL form create the idle composition. Once metadata arrives, the emblem shrinks to 58px above a 16:9 preview, followed by title, format/quality, folder and one Download button. Form content is left aligned; the emblem remains centered. Controls use opaque dark surfaces to preserve legibility over the character field.

## Engine strategy

Bundle pinned Windows x64 engines at build time. SHA-256 values come from the upstream GitHub release asset digests, committed in scripts/engine-manifest.json. FFmpeg is supplied by BtbN, a build provider linked by ffmpeg.org. No runtime downloads, updater, PATH dependency or administrator permissions. yt-dlp's official executable includes EJS; Deno is explicitly addressed. See THIRD_PARTY_NOTICES.md.

Subprocess arguments never pass through a shell. User yt-dlp configuration and plugins are disabled. Only single public HTTP(S) media URLs are supported. Downloads use isolated staging directories in the destination and publish without replacing an existing file.

