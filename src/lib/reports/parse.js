// Turns any uploaded .xlsx / .csv / .tsv into a typed table:
//   { columns: [{ key, label, type, role, agg }], rows: [[...]] }
//
// Built around Meta Ads Manager exports ("Amount spent (USD)", "Cost per
// result", "CTR (link click-through rate)", "Reporting starts", …) but works
// on any tabular file: columns are typed by sampling their values, and
// well-known Meta metrics additionally get a semantic `role` so the report
// view can build KPIs (spend, impressions, clicks, results, revenue…).
//
// `agg` says how a metric rolls up when rows are grouped: "sum" for
// additive counts/money, "avg" for ratios and rates that must not be added.

import ExcelJS from "exceljs";
import { parseCSV } from "@/lib/analytics/csv";
import { currencyOf } from "./aggregate";

export const MAX_ROWS = 100_000;

// Ordered: first match wins. Tested against lower-cased header text.
const ROLE_RULES = [
  ["date", /^(day|date|reporting starts|reporting start|week|month)$/],
  ["date_end", /^reporting ends?$/],
  ["campaign", /^campaign( name)?$/],
  ["adset", /^ad set( name)?$/],
  ["ad", /^ad( name)?$/],
  ["spend", /^(amount spent|spend|cost)(\s*\(|$)/],
  ["impressions", /^impressions$/],
  ["reach", /^reach$/],
  ["link_clicks", /^link clicks$/],
  ["clicks", /^clicks( \(all\))?$/],
  ["results", /^results$/],
  ["purchases", /^purchases$/],
  ["leads", /^(leads|meta leads|on-facebook leads)$/],
  ["revenue", /(purchases conversion value|conversion value|revenue)/],
];

const RATIO_RE = /(ctr|cpm|cpc|cpa|cost per|per 1,000|rate|frequency|roas|return on ad spend|average|avg|%|percentage|score|ranking)/;

function roleFor(label) {
  const l = label.toLowerCase().trim();
  for (const [role, re] of ROLE_RULES) if (re.test(l)) return role;
  return null;
}

// "1,234.50" "$1,234" "12.5%" "€3,40" → number; anything else → null.
export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  s = s.replace(/[\s$€£₹¥%]/g, "");
  // European formats: "1.234,56" and "1200,5" use the comma as decimal.
  // A lone comma followed by exactly 3 digits ("1,234") stays a thousands mark.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Returns YYYY-MM-DD or null.
export function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

function cellValue(v) {
  if (v == null) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? "";
    if ("text" in v) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return v.text || v.hyperlink;
    return String(v);
  }
  return v;
}

async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // Pick the sheet with the most rows — Meta exports have one, but people
  // often add a notes sheet in front.
  const sheet = [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!sheet) return [];
  const out = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values.slice(1).map(cellValue);
    out.push(vals);
  });
  return out;
}

function readDelimited(text) {
  const clean = text.replace(/^﻿/, "");
  const nl = clean.indexOf("\n");
  const firstLine = nl === -1 ? clean : clean.slice(0, nl);
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const c of firstLine) if (c in counts) counts[c]++;
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return parseCSV(clean, delimiter);
}

// Meta sometimes prefixes exports with a title line; take the first row
// that has at least half the max column count as the header row.
function findHeaderRow(matrix) {
  const width = Math.max(...matrix.slice(0, 20).map((r) => r.filter((c) => String(c ?? "").trim()).length));
  return matrix.findIndex((r) => r.filter((c) => String(c ?? "").trim()).length >= Math.max(2, width / 2));
}

function slug(label, used) {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "col";
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`;
  used.add(key);
  return key;
}

export async function parseReportFile(buffer, filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  let matrix;
  if (ext === "xlsx" || ext === "xlsm") matrix = await readXlsx(buffer);
  else if (["csv", "tsv", "txt"].includes(ext)) matrix = readDelimited(buffer.toString("utf8"));
  else throw new Error("Upload an .xlsx or .csv file. Older .xls files: open in Excel and save as .xlsx.");

  matrix = matrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (matrix.length < 2) throw new Error("That file doesn't have any data rows.");

  const h = findHeaderRow(matrix);
  const headers = matrix[h].map((c, i) => String(c ?? "").trim() || `Column ${i + 1}`);
  let body = matrix.slice(h + 1);
  if (body.length > MAX_ROWS) throw new Error(`That file has ${body.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()}.`);

  // Drop Meta's trailing "Total" / "Results from N rows" summary rows.
  body = body.filter((r) => !/^(total|results from \d+)/i.test(String(r[0] ?? "").trim()));

  const used = new Set();
  const columns = headers.map((label, i) => {
    const sample = body.slice(0, 500).map((r) => r[i]).filter((v) => String(v ?? "").trim() !== "");
    const nums = sample.filter((v) => toNumber(v) !== null).length;
    const dates = sample.filter((v) => toDate(v) !== null).length;
    const role = roleFor(label);
    let type = "text";
    if (sample.length && (role === "date" || role === "date_end" || dates / sample.length > 0.9)) type = "date";
    else if (sample.length && nums / sample.length > 0.9) type = "number";
    const lower = label.toLowerCase();
    return {
      key: slug(label, used),
      label,
      type,
      // Ratio columns never carry an additive role (e.g. "Cost per result"
      // must not be read as spend).
      role:
        (type === "number" && !RATIO_RE.test(lower)) || type === "date" || ["campaign", "adset", "ad"].includes(role)
          ? role
          : null,
      agg: type === "number" ? (RATIO_RE.test(lower) ? "avg" : "sum") : null,
    };
  });

  const rows = body.map((r) =>
    columns.map((c, i) => {
      const v = r[i];
      if (c.type === "number") return toNumber(v);
      if (c.type === "date") return toDate(v);
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();
      return s;
    }),
  );

  return { columns, rows };
}

// Totals + date span stored with the report so lists render instantly.
export function summarize(columns, rows) {
  const idx = Object.fromEntries(columns.map((c, i) => [c.role || c.key, i]));
  const sum = (role) => {
    const i = idx[role];
    if (i === undefined || columns[i].type !== "number") return null;
    return rows.reduce((a, r) => a + (r[i] || 0), 0);
  };
  const dateIdx = columns.findIndex((c) => c.type === "date");
  const dates = dateIdx >= 0 ? rows.map((r) => r[dateIdx]).filter(Boolean).sort() : [];
  const endIdx = columns.findIndex((c) => c.role === "date_end");
  const ends = endIdx >= 0 ? rows.map((r) => r[endIdx]).filter(Boolean).sort() : [];
  return {
    spend: sum("spend"),
    impressions: sum("impressions"),
    clicks: sum("link_clicks") ?? sum("clicks"),
    results: sum("results") ?? sum("purchases") ?? sum("leads"),
    revenue: sum("revenue"),
    currency: currencyOf(columns),
    dateFrom: dates[0] || null,
    dateTo: ends.at(-1) || dates.at(-1) || null,
    metrics: columns.filter((c) => c.type === "number").length,
    dimensions: columns.filter((c) => c.type === "text").length,
    source: columns.some((c) => c.role === "spend") && columns.some((c) => c.role === "impressions") ? "meta" : "file",
  };
}
