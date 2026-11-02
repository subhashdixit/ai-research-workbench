import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const root = new URL("../site/", import.meta.url);
test("all vendored runtime workers, WASM and license assets retain reviewed hashes", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("vendor-manifest.json", root)),
  );
  assert.ok(Object.keys(manifest).some((k) => k.endsWith("asyncify.wasm")));
  for (const [path, sha] of Object.entries(manifest))
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(new URL(path, root)))
        .digest("hex"),
      sha,
      path,
    );
});
