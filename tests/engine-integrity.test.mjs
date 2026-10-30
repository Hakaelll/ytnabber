import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { engineChecksums } from "../scripts/engine-integrity.mjs";

test("production inventory detects changed binaries and rejects debug files", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "ytnabber-integrity-"));
  try {
    await writeFile(path.join(folder, "deno.exe"), "fixture");
    const before = await engineChecksums(folder);
    await writeFile(path.join(folder, "deno.exe"), "changed fixture");
    assert.notDeepEqual(await engineChecksums(folder), before);
    await writeFile(path.join(folder, "deno.pdb"), "debug symbols");
    await assert.rejects(engineChecksums(folder), /Unexpected engine resource/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
