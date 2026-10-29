import test from "node:test";
import assert from "node:assert/strict";
import { durationLabel, bytesLabel, validWebUrl, errorLabel } from "../src/presentation.ts";

test("duration and throughput handle missing values and hour boundaries", () => {
  assert.equal(durationLabel(null), "Duration unavailable");
  assert.equal(durationLabel(65.9), "1:05");
  assert.equal(durationLabel(3661), "1:01:01");
  assert.equal(bytesLabel(1048576), "1.0 MB");
  assert.equal(bytesLabel(Number.NaN), "0 B");
});
test("only complete HTTP URLs without credentials reach the native boundary", () => {
  assert.equal(validWebUrl("https://youtube.com/watch?v=x"), true);
  for (const input of ["javascript:alert(1)", "file:///secret", "youtube.com", "https://u:p@host.com", ""]) assert.equal(validWebUrl(input), false);
});
test("actionable failures retain useful recovery guidance", () => {
  assert.match(errorLabel("ERROR: No space left on device"), /disk is full/);
  assert.match(errorLabel("Requested format is not available"), /no longer available/);
  assert.match(errorLabel("Sign in to confirm you are not a bot"), /temporarily blocking/);
});


test("source bot checks are distinct from private videos and incidental cookie hints", () => {
  assert.match(errorLabel("Sign in to confirm you're not a bot. Use --cookies for authentication."), /temporarily blocking/);
  assert.match(errorLabel("Private video. Sign in if you have access."), /requires access/);
  assert.doesNotMatch(errorLabel("Unable to download: connection reset; cookie documentation is available"), /requires access/);
});
