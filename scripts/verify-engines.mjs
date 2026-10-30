import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { engineChecksums } from "./engine-integrity.mjs";
import { fileURLToPath } from "node:url";

const read = async url => JSON.parse(await readFile(new URL(url, import.meta.url), "utf8"));
const root = new URL("../src-tauri/engines/", import.meta.url);
assert.deepEqual(await read("../src-tauri/engines/versions.json"), await read("./engine-manifest.json"), "Prepared engines are stale; run npm run engines:prepare.");
assert.deepEqual((await read("../src-tauri/engines/ffmpeg-build.json")).recipe, await read("./ffmpeg/vcpkg.json"), "The FFmpeg build recipe changed; run npm run engines:prepare.");
assert.deepEqual(await engineChecksums(fileURLToPath(root)), await read("../src-tauri/engines/checksums.json"), "Engine resources changed or are incomplete; run npm run engines:prepare.");
console.log("Verified production engine manifest, recipe and file integrity.");
