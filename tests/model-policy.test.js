import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CATALOG, prepareGeneration } from "../site/model-policy.js";
test("model identities are fixed to reviewed revisions", () => {
  assert.equal(Object.keys(MODEL_CATALOG).length, 3);
  for (const m of Object.values(MODEL_CATALOG))
    assert.match(m.revision, /^[a-f0-9]{40}$/);
});
test("oversized requests and unsupported models fail before a download", () => {
  const r = {
    model: "compact",
    tool: "summary",
    context: "A short source.",
    question: "Summarize.",
  };
  assert.ok(prepareGeneration(r).instruction.includes("quoted data"));
  for (const patch of [
    { model: "https://evil.test" },
    { context: "x".repeat(3501) },
    { question: "x".repeat(601) },
    { model: "vision" },
  ])
    assert.throws(() => prepareGeneration({ ...r, ...patch }));
});
test("vision requires an image tool and a local data URL", () => {
  const r = {
    model: "vision",
    tool: "invoice",
    context: "",
    question: "Read the total",
    image: "data:image/png;base64,c3ludGhldGlj",
  };
  assert.equal(prepareGeneration(r).tool, "invoice");
  assert.throws(() => prepareGeneration({ ...r, tool: "summary" }));
  assert.throws(() =>
    prepareGeneration({ ...r, image: "https://example.test/a.png" }),
  );
});
