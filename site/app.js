import {
  boundedText,
  summarize,
  chunks,
  retrieve,
  invoiceFields,
  validateInvoice,
  coverTemplate,
  citationCheck,
} from "./engine.js";
import { $, announce, download } from "./ui.js";
import { extractDocument } from "./documents.js";
const config = await (await fetch("./config.json")).json();
const example = await (await fetch("./example.json")).json();
let image = null,
  previewURL = null,
  newsDocs = [],
  busy = false;
const methods = {
  research:
    "Local mode extracts representative sentences from supplied feed excerpts; AI mode synthesizes them with source IDs.",
  summary:
    "Local mode copies high-scoring source sentences in original order. Gemini mode may paraphrase; check all numbers and qualifications.",
  invoice:
    "Local mode finds labelled header/total fields heuristically. Correct the JSON before export. An arithmetic match is not proof that an invoice is genuine.",
  multimodal:
    "Local OCR recognizes visible text. Questions about image meaning require Gemini. This tool does not generate images.",
  equity:
    "Local mode uses BM25 to find financial-document excerpts. It is source retrieval, not an investment recommendation.",
  faq: "The included FAQ is historical source material, not current company policy. Local mode retrieves matching original answers.",
  "cover-letter":
    "Local mode creates an explicitly labelled template using supplied profile lines. Optional Gemini mode rewrites without inventing qualifications.",
};
$("method").textContent = methods[config.tool];
$("local").textContent =
  {
    invoice: "Extract invoice fields locally",
    equity: "Retrieve source excerpts",
    faq: "Find historical FAQ answers",
    "cover-letter": "Create local template",
    multimodal: "Summarize recognized image text",
  }[config.tool] || "Create local extractive summary";
if (config.tool === "cover-letter") {
  $("context-label").firstChild.textContent = "Your resume facts (text only)";
  $("question-label").firstChild.textContent = "Job requirements";
}
function reset() {
  $("context").value = example.sample;
  $("question").value = example.question;
  $("output").value = "";
  $("validation").textContent = "";
  $("evidence").replaceChildren();
  $("result-label").textContent = "";
  $("consent").checked = false;
  newsDocs = [];
  image = null;
  if ($("preview")) {
    $("image").value = "";
    $("preview").hidden = true;
    if (previewURL) URL.revokeObjectURL(previewURL);
  }
  announce(
    "Example loaded. Local tools do not send your content to the gateway.",
  );
}
function documents() {
  if (config.tool === "faq" && $("context").value === example.sample)
    return example.faqs;
  if (config.tool === "research" && newsDocs.length) return newsDocs;
  return chunks($("context").value);
}
function evidence(sources) {
  $("evidence").replaceChildren();
  for (const source of sources) {
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      p = document.createElement("p");
    summary.textContent = `[${source.id}] ${source.title}${source.score !== undefined ? " · BM25 " + source.score.toFixed(3) : ""}`;
    p.textContent = source.text;
    details.append(summary, p);
    $("evidence").append(details);
  }
}
function local() {
  try {
    $("validation").textContent = "";
    let output;
    const text = $("context").value;
    switch (config.tool) {
      case "invoice": {
        const r = invoiceFields(text);
        output = JSON.stringify(r.fields, null, 2);
        $("validation").textContent = r.reconciliation
          ? `Subtotal + tax comparison: ${r.reconciliation.matches ? "matches within 0.01" : "difference " + r.reconciliation.difference}. Shipping/discounts may require corrections.`
          : "Totals incomplete. Correct missing values; unknown fields stay null.";
        break;
      }
      case "equity":
      case "faq": {
        const sources = retrieve(
          documents(),
          boundedText($("question").value, 4000),
        );
        evidence(sources);
        output = sources.length
          ? sources.map((d) => `[${d.id}] ${d.title}\n${d.text}`).join("\n\n")
          : "No matching source evidence found. Rephrase or add a relevant document.";
        break;
      }
      case "cover-letter": {
        const r = coverTemplate(text, $("question").value);
        output = r.draft;
        $("validation").textContent =
          "Lexical overlap (not a qualification score): " +
          (r.overlap.join(", ") || "none");
        break;
      }
      default:
        output = summarize(text, Number($("sentences").value)).join("\n\n");
        if (config.tool === "research") evidence(documents());
    }
    $("output").value = output;
    $("result-label").textContent =
      config.tool === "cover-letter"
        ? "Local template · review and edit before use"
        : config.tool === "equity" || config.tool === "faq"
          ? "Local source retrieval · exact excerpts, not generated answers"
          : "Local extraction · no generative model used";
    announce(
      "Local processing complete. Review the result against its source.",
    );
  } catch (error) {
    announce(error.message);
  }
}
async function timedFetch(url, options = {}, ms = 65000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: "omit",
    });
  } finally {
    clearTimeout(timer);
  }
}
async function health() {
  try {
    const r = await timedFetch(config.gateway + "/health/ready", {}, 18000);
    if (!r.ok) throw Error("Gateway unavailable");
    const h = await r.json();
    $("provider-status").textContent = h.provider_configured
      ? `Gateway ready · ${h.model}. A successful real request is still required to verify quota/access.`
      : "Gateway reachable; Gemini key is not configured. Local tools work; real AI generation is unavailable.";
    $("generate").disabled = !h.provider_configured;
  } catch {
    $("provider-status").textContent =
      "Gateway not reachable yet (or waking from free-tier sleep). Local tools remain available. Reload to retry.";
    $("generate").disabled = true;
  }
}
async function generate() {
  if (busy) return;
  try {
    if (!$("consent").checked)
      throw Error("Confirm external processing first.");
    let context = $("context").value,
      question = $("question").value,
      sources = [];
    if (["equity", "faq"].includes(config.tool)) {
      sources = retrieve(documents(), boundedText(question, 4000));
      if (!sources.length)
        throw Error(
          "No matching source evidence. Add relevant material first.",
        );
      evidence(sources);
      context = sources
        .map((s) => `[${s.id}] ${s.title}\n${s.text}`)
        .join("\n\n");
    }
    if (config.tool === "research") {
      sources = documents();
      evidence(sources);
      context = sources
        .map((s) => `[${s.id}] ${s.title}\n${s.text}`)
        .join("\n\n");
    }
    if (config.tool === "cover-letter") {
      context =
        "PROFILE FACTS:\n" +
        boundedText(context, 18000) +
        "\n\nJOB REQUIREMENTS:\n" +
        boundedText(question, 18000);
      question =
        "Draft a concise cover letter using only supported profile facts.";
    }
    if (context.length > 40000 || question.length > 4000)
      throw Error("AI limits: 40,000 context and 4,000 question characters.");
    busy = true;
    $("generate").disabled = true;
    announce(
      "Sending your consented content to the gateway and Google Gemini…",
    );
    const payload = { tool: config.tool, context, question, consent: true };
    if (image) payload.image = image;
    const response = await timedFetch(config.gateway + "/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Provider request failed.");
    if (typeof result.answer !== "string")
      throw Error("Invalid gateway response.");
    if (config.tool === "invoice") {
      const checked = validateInvoice(JSON.parse(result.answer));
      $("output").value = JSON.stringify(checked.fields, null, 2);
      $("validation").textContent = checked.reconciliation
        ? `Total reconciliation difference: ${checked.reconciliation.difference}. Check the original image.`
        : "Missing totals: review all extracted fields.";
    } else {
      $("output").value = result.answer;
      if (sources.length) {
        const check = citationCheck(
          result.answer,
          sources.map((s) => s.id),
        );
        $("validation").textContent = check.unknown.length
          ? "Warning: unrecognized citations " + check.unknown.join(", ")
          : check.missing
            ? "Warning: generated answer lacks source IDs. Verify every claim."
            : "Citation IDs exist in supplied sources. This does not verify each claim.";
      }
    }
    $("result-label").textContent =
      `Generated by ${result.model} · ${result.finish_reason}. Review all claims and possible truncation.`;
    announce(
      "Provider response received. No automatic factual verification is implied.",
    );
  } catch (error) {
    announce(
      error.name === "AbortError"
        ? "Gateway timed out. It may be waking from sleep; try later."
        : error.message,
    );
  } finally {
    busy = false;
    health();
  }
}
$("local").addEventListener("click", local);
$("example").addEventListener("click", reset);
$("generate").addEventListener("click", generate);
$("file").addEventListener("change", async (event) => {
  try {
    announce("Extracting the selected document locally…");
    $("context").value = await extractDocument(event.target.files[0]);
    newsDocs = [];
    $("source-label").textContent =
      "Your local document · not sent externally unless you choose Gemini and consent.";
    announce(
      "Document text extracted locally. Check reading order before analysis.",
    );
  } catch (error) {
    announce(error.message);
  }
});
$("export").addEventListener("click", () => {
  try {
    const output = boundedText($("output").value, 100000);
    if (config.tool === "invoice") {
      const checked = validateInvoice(JSON.parse(output));
      download(
        "invoice-reviewed.json",
        JSON.stringify(checked.fields, null, 2),
        "application/json",
      );
    } else download(config.tool + "-reviewed.txt", output);
  } catch (error) {
    announce(error.message);
  }
});
if ($("load-feed"))
  $("load-feed").addEventListener("click", async () => {
    try {
      announce("Fetching attributed excerpts from the fixed official source…");
      const response = await timedFetch(
        config.gateway +
          "/api/news?feed=" +
          encodeURIComponent($("feed").value),
        {},
        45000,
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Source unavailable.");
      newsDocs = result.items.slice(0, 12).map((item, i) => ({
        id: `S${i + 1}`,
        title: item.title,
        text: `${item.published}\n${item.excerpt}\nSource: ${item.url}`,
        url: item.url,
      }));
      $("news-items").replaceChildren();
      for (const doc of newsDocs) {
        const p = document.createElement("p"),
          a = document.createElement("a");
        const url = new URL(doc.url);
        if (!["https:", "http:"].includes(url.protocol)) continue;
        a.href = url.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = `[${doc.id}] ${doc.title}`;
        p.append(a);
        $("news-items").append(p);
      }
      $("context").value = newsDocs
        .map((s) => `[${s.id}] ${s.title}\n${s.text}`)
        .join("\n\n");
      $("source-label").textContent =
        `Fetched ${new Date().toISOString()} · ${result.source} · gateway cache ${result.cached ? "hit" : "miss"}. Article dates may differ from fetch time.`;
      announce(
        "Source excerpts loaded. Read the linked originals for complete context.",
      );
    } catch (error) {
      announce(error.message);
    }
  });
if ($("image")) {
  $("image").addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (
        !file ||
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      )
        throw Error("Choose a PNG/JPEG up to 2 MiB.");
      image = null;
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(file);
      const img = new Image();
      img.src = previewURL;
      await img.decode();
      if (img.width * img.height > 16000000)
        throw Error("Image exceeds 16 megapixels.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("Cannot read image."));
        reader.readAsDataURL(file);
      });
      image = { mimeType: file.type, data: data.split(",")[1] };
      $("preview").src = previewURL;
      $("preview").hidden = false;
      announce(
        "Image loaded locally. OCR is local; Gemini sends this image externally only after consent.",
      );
    } catch (error) {
      image = null;
      $("preview").hidden = true;
      announce(error.message);
    }
  });
  $("ocr").addEventListener("click", async () => {
    let worker;
    try {
      if (!image) throw Error("Choose an image first.");
      $("ocr").disabled = true;
      announce("Loading local OCR engine and language data…");
      const { createWorker } = await import("./vendor/ocr/tesseract.js");
      const base = new URL("./vendor/ocr/", import.meta.url).href;
      worker = await createWorker($("ocr-language").value, 1, {
        workerPath: base + "worker.min.js",
        corePath: base + "tesseract-core-lstm.wasm.js",
        langPath: base,
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (event) =>
          announce(
            `Local OCR: ${event.status} ${Math.round((event.progress || 0) * 100)}%`,
          ),
      });
      const result = await worker.recognize(
        "data:" + image.mimeType + ";base64," + image.data,
      );
      $("context").value = result.data.text.slice(0, 40000);
      announce(
        `OCR completed locally · engine confidence ${result.data.confidence.toFixed(1)} (not calibrated accuracy). Check every number.`,
      );
    } catch (error) {
      announce(error.message);
    } finally {
      if (worker) await worker.terminate();
      $("ocr").disabled = false;
    }
  });
}
reset();
health();
