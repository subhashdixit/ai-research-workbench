/** Local text tools. Retrieval/extraction are deliberately distinct from generation. */
export function boundedText(value, max = 40000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw Error(`Provide 1–${max.toLocaleString()} characters.`);
  return value.trim();
}
export function tokens(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
    (t) => t.length > 1,
  );
}
export function summarize(text, count = 5) {
  text = boundedText(text);
  if (!Number.isInteger(count) || count < 1 || count > 12)
    throw Error("Choose 1–12 sentences.");
  const sentences = text
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((s) => s.trim())
    .filter(Boolean) || [text];
  const freq = new Map();
  for (const t of tokens(text)) freq.set(t, (freq.get(t) || 0) + 1);
  const stop = new Set(
    "the and that this with from have were been are for not but into your you".split(
      " ",
    ),
  );
  return sentences
    .map((sentence, index) => {
      const words = tokens(sentence).filter((w) => !stop.has(w));
      return {
        sentence,
        index,
        score:
          words.reduce((s, w) => s + Math.log1p(freq.get(w) || 0), 0) /
          Math.sqrt(words.length || 1),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);
}
export function chunks(text, size = 900) {
  text = boundedText(text);
  const result = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n|(?<=[.!?])\s+/)) {
    if (current.length + paragraph.length > size && current) {
      result.push(current);
      current = "";
    }
    if (paragraph.length > size) {
      if (current) {
        result.push(current);
        current = "";
      }
      for (let j = 0; j < paragraph.length; j += size)
        result.push(paragraph.slice(j, j + size));
    } else current += (current ? "\n" : "") + paragraph;
  }
  if (current) result.push(current);
  return result.map((body, i) => ({
    id: `S${i + 1}`,
    title: `Document excerpt ${i + 1}`,
    text: body,
  }));
}
export function retrieve(documents, question, limit = 4) {
  boundedText(question, 4000);
  if (!Array.isArray(documents) || documents.length > 1000)
    throw Error("Use up to 1,000 excerpts.");
  const query = [...new Set(tokens(question))],
    k = 1.2,
    b = 0.75;
  const corpus = documents.map((d) => tokens(d.text)),
    avg = corpus.reduce((s, t) => s + t.length, 0) / (corpus.length || 1) || 1;
  const df = new Map();
  for (const ts of corpus)
    for (const t of new Set(ts)) df.set(t, (df.get(t) || 0) + 1);
  return documents
    .map((doc, i) => {
      const freq = new Map();
      for (const t of corpus[i]) freq.set(t, (freq.get(t) || 0) + 1);
      const score = query.reduce((s, t) => {
        const f = freq.get(t) || 0,
          n = df.get(t) || 0;
        return (
          s +
          (Math.log(1 + (documents.length - n + 0.5) / (n + 0.5)) *
            f *
            (k + 1)) /
            (f + k * (1 - b + (b * corpus[i].length) / avg))
        );
      }, 0);
      return { ...doc, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
export function invoiceFields(text) {
  text = boundedText(text);
  const number = (label) => {
    const m = text.match(
      new RegExp(
        String.raw`(?:^|\n)\s*(?:${label})\s*[:=]?\s*(?:[A-Z]{3}|[$₹€£])?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:$|\n)`,
        "i",
      ),
    );
    return m ? Number(m[1].replaceAll(",", "")) : null;
  };
  const fields = {
    vendor: text.split("\n").find((x) => x.trim()) || null,
    invoice_number:
      text.match(/invoice\s*(?:number|no\.?|#)\s*[:#]?\s*([\w/-]+)/i)?.[1] ||
      null,
    date: text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || null,
    currency: text.match(/\b(INR|USD|EUR|GBP)\b/i)?.[1]?.toUpperCase() || null,
    subtotal: number("subtotal"),
    tax: number("tax|gst|vat"),
    total: number("total|grand total"),
    items: [],
  };
  return validateInvoice(fields);
}
export function validateInvoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invoice must be a JSON object.");
  const result = {};
  for (const k of ["vendor", "invoice_number", "date", "currency"]) {
    if (
      value[k] !== null &&
      value[k] !== undefined &&
      typeof value[k] !== "string"
    )
      throw Error(`Invalid ${k}.`);
    result[k] = value[k]?.slice(0, 500) || null;
  }
  for (const k of ["subtotal", "tax", "total"]) {
    const n = value[k];
    if (
      n !== null &&
      n !== undefined &&
      (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e12)
    )
      throw Error(`Invalid ${k}.`);
    result[k] = n ?? null;
  }
  if (!Array.isArray(value.items) || value.items.length > 300)
    throw Error("Use an items array with up to 300 entries.");
  result.items = value.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw Error("Invalid invoice item.");
    const out = { description: String(item.description ?? "").slice(0, 500) };
    for (const k of ["quantity", "unit_price", "amount"]) {
      const n = item[k];
      if (
        n !== null &&
        n !== undefined &&
        (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e12)
      )
        throw Error(`Invalid item ${k}.`);
      out[k] = n ?? null;
    }
    return out;
  });
  const complete = ["subtotal", "tax", "total"].every(
    (k) => result[k] !== null,
  );
  return {
    fields: result,
    reconciliation: complete
      ? {
          difference: Number(
            (result.total - result.subtotal - result.tax).toFixed(2),
          ),
          matches:
            Math.abs(result.total - result.subtotal - result.tax) <= 0.01,
        }
      : null,
  };
}
export function coverTemplate(resume, job) {
  resume = boundedText(resume, 18000);
  job = boundedText(job, 18000);
  const wanted = new Set(tokens(job)),
    common = [...new Set(tokens(resume))]
      .filter((t) => wanted.has(t) && t.length > 3)
      .slice(0, 20);
  const facts = resume
    .split(/\n/)
    .filter((s) => s.trim())
    .slice(0, 5);
  return {
    overlap: common,
    draft: `Dear Hiring Team,\n\nI am interested in the advertised opportunity. Below are facts from my provided profile that I would like to discuss:\n\n${facts.map((s) => "- " + s.trim()).join("\n")}\n\nI would welcome a conversation about how this experience relates to your requirements.\n\nSincerely,\n[Your name]\n\n[Local template: review relevance, tone and every statement before sending.]`,
  };
}
export function citationCheck(answer, ids) {
  const cited = [...answer.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
  return {
    cited: [...new Set(cited)],
    unknown: [...new Set(cited.filter((id) => !ids.includes(id)))],
    missing: cited.length === 0,
  };
}
