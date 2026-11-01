export const $ = (id) => document.getElementById(id);
export function announce(text) {
  $("status").textContent = text;
}
export function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function parseCSV(text) {
  if (typeof text !== "string" || text.length > 5 * 1024 * 1024)
    throw Error("Use a CSV up to 5 MiB.");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
      } else if (!cell) {
        quoted = true;
      } else throw Error("Malformed CSV quote.");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function lineChart(
  id,
  series,
  { label = "Observation index", unit = "Value" } = {},
) {
  const svg = $(id),
    ns = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 960 400");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", series.map((s) => s.name).join(" versus "));
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return;
  let lo = Math.min(...all),
    hi = Math.max(...all);
  if (hi === lo) {
    hi++;
    lo--;
  }
  const x = (i) =>
      65 +
      (i * 860) /
        Math.max(1, Math.max(...series.map((s) => s.values.length)) - 1),
    y = (v) => 325 - ((v - lo) * 265) / (hi - lo);
  function el(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  }
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    el("line", { x1: 65, x2: 925, y1: y(v), y2: y(v), stroke: "#2c4058" });
    el(
      "text",
      { x: 4, y: y(v) + 5, fill: "#b4c6da", "font-size": 13 },
      v.toFixed(2),
    );
  }
  series.forEach((s, j) => {
    const color = s.color || ["#80e3cd", "#ffcf75", "#c8a5ff"][j % 3];
    el("polyline", {
      points: s.values
        .map((v, i) => (Number.isFinite(v) ? `${x(i)},${y(v)}` : ""))
        .join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 2,
    });
    el(
      "text",
      { x: 65 + j * 260, y: 25, fill: color, "font-size": 15 },
      s.name,
    );
  });
  el("text", { x: 380, y: 380, fill: "#b4c6da" }, label);
  el("text", { x: 65, y: 48, fill: "#b4c6da", "font-size": 13 }, unit);
}
export async function readText(file, max = 5 * 1024 * 1024) {
  if (!file || file.size > max)
    throw Error("Choose a file within the stated size limit.");
  return file.text();
}
