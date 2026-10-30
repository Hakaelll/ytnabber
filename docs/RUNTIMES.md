# JavaScript runtime size study

Measured on Windows x64, 29 October 2026. This study does not change the
production runtime. yt-dlp 2026.10.26 includes yt-dlp-ejs 0.8.0.

| Official runtime asset | Actual bytes | Installed MiB | Result |
| --- | ---: | ---: | --- |
| Bundled Deno 2.9.8 deno.exe | 98,081,568 | 93.54 | Existing explicit runtime |
| QuickJS-NG 0.17.0 qjs-windows-x86_64.exe | 2,151,363 | 2.05 | Real EJS challenge + download passed |
| Deno 2.9.8 Windows ZIP | 42,917,472 | n/a, archive | Already verified against pinned SHA-256 |
| denort 2.9.8 Windows ZIP | 32,979,811 | Not measured | Not a compatible substitute |

The direct binary saving from Deno to QuickJS-NG would be **95,930,205 bytes
(91.49 MiB, 97.81% of this runtime)**. That is about 32.8% of the original
portable runtime staging. Installer savings require an actual rebuilt NSIS
package; they cannot be inferred from this uncompressed difference.

## Actual QuickJS experiment

Downloaded the official [0.17.0 Windows x64 asset](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0).
Verified SHA-256 against GitHub's asset digest before execution:
`2aeabf0092c3262d6b2609824418f7dd7ed1f1df939f73b2b15645230cac0d77`.
Used `--no-js-runtimes --js-runtimes quickjs:<absolute path>` with the bundled
yt-dlp and FFmpeg, zero retries and a 20-second socket timeout. No cookies,
credentials or external providers. One download of the public reference
`https://www.youtube.com/watch?v=jNQXAC9IVRw` was performed.

yt-dlp reported `JS runtimes: quickjs-ng-0.17.0`,
`[jsc:quickjs] Solving JS challenges using quickjs`, and both matching EJS
scripts from its bundled Python package. It downloaded separate video/audio
streams, merged them, and exited successfully. Bundled FFprobe reported a
440,620-byte, 19.014-second MP4 containing 144p VP9 and Opus. This proves a
real challenge/download, **not** Windows MP4 codec compatibility. It is a
single-video result, not a universal reliability or performance guarantee.
Verbose scratch logs had media URLs redacted and are excluded from Git/package.

## Security comparison

Inspected the [pinned QuickJS provider](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/yt_dlp/extractor/youtube/jsc/_builtin/quickjs.py)
and [Deno provider](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/yt_dlp/extractor/youtube/jsc/_builtin/deno.py).
QuickJS runs a temporary classic script. Deno reads stdin and uses restricted
permissions, no prompt/config/remote imports and cached bundled EJS libraries.

A harmless local fixture demonstrated that stock QuickJS-NG can dynamically
import `qjs:std` and read a file with `std.loadFile` even without `--std`.
The equivalent `Deno.readTextFileSync` under `deno run --no-prompt` failed
with `NotCapable`. Therefore omitting `--std` is **not** a filesystem sandbox.
This does not demonstrate an exploit in EJS; it demonstrates different
runtime capabilities if a script escapes the expected solver behavior.
The upstream guide also documents temporary-script TOCTOU concerns for QuickJS.

## Decision for this update

Retain one bundled Deno while fixing the engine and codecs. A direct switch to
stock QuickJS would violate the request to retain security. QuickJS-NG is the
most promising small **supported** runtime for a future measured trial with
an audited restricted host or Windows process isolation. Such a host needs
separate implementation, security review and real challenge regression tests;
do not claim this trial already provides those properties.

No official slim Deno CLI asset was found in its release. `denort` and
`libdenort` serve compiled applications; the [yt-dlp EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS)
explicitly says to download `deno`, not `denort`. Compiling a fixed JS program
with Deno is not a drop-in CLI for arbitrary future EJS inputs. Downgrading
to the minimum version just to save bytes would discard later fixes.

The official Node 22.23.4 `win-x64/node.exe` endpoint reported a Content-Length
of 87,034,184 bytes (83.00 MiB). This is remote asset metadata, not a downloaded
or EJS-tested binary in this study; its binary-only saving over Deno would be
10.54 MiB. The pinned yt-dlp Node provider invokes Node's permission mode.
No second Node runtime is added. Bun is deprecated by yt-dlp. Relying on a user's system
runtime or downloading it after install would not make the package
self-contained. UPX/installer compression alone does not reduce the amount
of code mapped/extracted at runtime and is not the optimization sought here.

For growth, keep runtime/backend/frontend size budgets separate, retain the
current Tauri architecture, and measure every release's file inventory. The
next independent size target was the broad FFmpeg shared build (155.21 MiB),
especially optional codec/filter/device libraries, not the 7.46 MiB app.

The final 0.1.1 build keeps Deno and instead reduces the actual FFmpeg binary
set from 155.21 to 29.67 MiB, while retaining the required operations. The
installer measures 64.06 MiB. See UPDATE-0.1.1.md for the full before/after
inventory, functional checks and remaining clean-machine/manual checks.
