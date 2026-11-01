import test from "node:test";
import assert from "node:assert/strict";
import {
  boundedText,
  summarize,
  chunks,
  retrieve,
  invoiceFields,
  validateInvoice,
  coverTemplate,
  citationCheck,
} from "../site/engine.js";
test("extractive output preserves source sentences and order", () => {
  const text = "Revenue grew. Revenue grew with new clients. Costs fell.";
  const out = summarize(text, 2);
  assert.equal(out.length, 2);
  for (const s of out) assert.ok(text.includes(s));
  assert.ok(text.indexOf(out[0]) < text.indexOf(out[1]));
  assert.throws(() => summarize(text, 0));
});
test("chunks bound long paragraphs and retain content", () => {
  const s = "x".repeat(2100);
  const c = chunks(s);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.text.length <= 900));
  assert.equal(c.map((x) => x.text).join(""), s);
});
test("BM25 retrieves relevant evidence and no invented match", () => {
  const docs = [
    { id: "S1", text: "Python programming for beginners" },
    { id: "S2", text: "Historical tax refund rules" },
  ];
  assert.equal(retrieve(docs, "Python beginners")[0].id, "S1");
  assert.deepEqual(retrieve(docs, "photosynthesis"), []);
});
test("known invoice totals reconcile; missing fields remain unknown", () => {
  const r = invoiceFields(
    "Demo Ltd\nInvoice No: A-1\nINR\nSubtotal: 100.00\nTax: 18.00\nTotal: 118.00",
  );
  assert.equal(r.fields.invoice_number, "A-1");
  assert.equal(r.fields.tax, 18);
  assert.equal(r.reconciliation.matches, true);
  const partial = invoiceFields("Some vendor\nInvoice No: B-2");
  assert.equal(partial.fields.total, null);
  assert.equal(partial.reconciliation, null);
});
test("invoice mismatch is visible and malformed numbers rejected", () => {
  const r = validateInvoice({ subtotal: 100, tax: 18, total: 120, items: [] });
  assert.equal(r.reconciliation.difference, 2);
  assert.throws(() => validateInvoice({ total: "118", items: [] }));
  assert.throws(() => validateInvoice({ total: NaN, items: [] }));
  assert.throws(() => validateInvoice({ items: [{ quantity: Infinity }] }));
});
test("template uses only supplied profile lines and flags placeholders", () => {
  const r = coverTemplate("Example Person\nUses SQL", "SQL and Python analyst");
  assert.ok(r.draft.includes("Uses SQL"));
  assert.ok(!r.draft.includes("Uses Python"));
  assert.ok(r.draft.includes("Local template"));
});
test("unknown and missing citation IDs are reported", () => {
  assert.deepEqual(citationCheck("claim [S1] and [S9]", ["S1"]).unknown, [
    "S9",
  ]);
  assert.equal(citationCheck("no citation", ["S1"]).missing, true);
});
test("input limits are explicit", () => {
  assert.throws(() => boundedText(" "));
  assert.throws(() => boundedText("abc", 2));
  assert.throws(() => retrieve([], " "));
});
