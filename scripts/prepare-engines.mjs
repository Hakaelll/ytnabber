import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, readdir, rm, mkdtemp, cp, rename } from "node:fs/promises";
import assert from "node:assert/strict";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildFFmpeg } from "./build-ffmpeg.mjs";
import { engineChecksums } from "./engine-integrity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = path.join(root, ".cache", "engines");
const target = path.join(root, "src-tauri", "engines");
const manifest = JSON.parse(await readFile(new URL("./engine-manifest.json", import.meta.url), "utf8"));
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The bundled engines target Windows x64.");
await mkdir(cache, { recursive: true });
const output = await mkdtemp(path.join(cache, "prepared-"));
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest("hex");
}
for (const engine of manifest) {
  if (engine.build) {
    assert(engine.name === "ffmpeg" && engine.build === "vcpkg", "Unknown engine build recipe.");
    await cp(await buildFFmpeg(), output, { recursive: true });
    continue;
  }
  const archive = path.join(cache, engine.filename);
  let valid = false;
  try { valid = await sha256(archive) === engine.sha256; } catch {}
  if (!valid) {
    console.log("Downloading " + engine.name + " " + engine.version);
    const response = await fetch(engine.url);
    if (!response.ok || !response.body) throw new Error("Download failed: " + engine.url);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive + ".partial"));
    if (await sha256(archive + ".partial") !== engine.sha256) throw new Error("SHA-256 mismatch: " + engine.name);
    await copyFile(archive + ".partial", archive);
    await rm(archive + ".partial");
  }
  if (engine.filename.endsWith(".exe")) {
    await copyFile(archive, path.join(output, engine.filename));
  } else {
    const unpacked = path.join(cache, engine.name + "-" + engine.sha256.slice(0, 12) + "-unpacked");
    await mkdir(unpacked, { recursive: true });
    execFileSync("tar.exe", ["-xf", archive, "-C", unpacked], { windowsHide: true });
    async function copyTree(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) await copyTree(file);
        else if (entry.name.endsWith(".dll") || ["deno.exe", "ffmpeg.exe", "ffprobe.exe", "LICENSE", "LICENSE.txt"].includes(entry.name)) {
          const name = entry.name.startsWith("LICENSE") ? engine.name + "-" + entry.name : entry.name;
          await copyFile(file, path.join(output, name));
        }
      }
    }
    await copyTree(unpacked);
  }
  console.log("Verified " + engine.name);
}
await writeFile(path.join(output, "versions.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(output, ".gitkeep"), "\n");
await writeFile(path.join(output, "checksums.json"), JSON.stringify(await engineChecksums(output), null, 2));
for (const [name, flag] of [["yt-dlp.exe", "--version"], ["deno.exe", "--version"], ["ffmpeg.exe", "-version"], ["ffprobe.exe", "-version"]]) {
  execFileSync(path.join(output, name), [flag], { windowsHide: true });
}
const backup = path.join(cache, `previous-${process.pid}-${Date.now()}`);
assert(path.dirname(path.resolve(backup)) === path.resolve(cache), "Previous resources must stay within the cache.");
await rename(target, backup);
try { await rename(output, target); }
catch (error) { await rename(backup, target); throw error; }
await rm(backup, { recursive: true, force: true });
console.log("Engines ready.");
