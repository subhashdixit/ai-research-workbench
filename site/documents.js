export async function extractDocument(file) {
  if (!file || file.size > 5 * 1024 * 1024)
    throw Error("Choose a document up to 5 MiB.");
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    const text = await file.text();
    if (text.length > 40000)
      throw Error("Document exceeds 40,000 characters; split it first.");
    return text;
  }
  const pdfjs = await import("./vendor/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "./vendor/pdfjs/pdf.worker.mjs",
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 60) throw Error("Use a PDF with up to 60 pages.");
    let text = "";
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text +=
        `[Page ${page}]\n` +
        content.items.map((item) => item.str).join(" ") +
        "\n\n";
      if (text.length > 40000)
        throw Error("PDF text exceeds 40,000 characters; split it first.");
    }
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 20)
      throw Error(
        "No selectable text. OCR a scanned page using an image tool first.",
      );
    return text;
  } finally {
    await task.destroy();
  }
}
