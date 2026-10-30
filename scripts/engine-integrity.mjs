import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function engineChecksums(directory, prefix = "") {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (name === ".gitkeep" || name === "checksums.json") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assert.equal(name, "licenses", "Unexpected engine resource directory: " + name);
      Object.assign(files, await engineChecksums(file, name + "/"));
    } else {
      assert(entry.isFile() && /^(?:(?:yt-dlp|deno|ffmpeg|ffprobe)\.exe|[\w-]+\.dll|(?:versions|ffmpeg-build)\.json|licenses\/[\w-]+\.txt)$/i.test(name), "Unexpected engine resource: " + name);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      files[name] = hash.digest("hex");
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
