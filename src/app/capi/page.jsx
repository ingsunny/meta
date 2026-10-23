"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, ChevronUp, ChevronDown, ArrowUpDown, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCSVLine(line);
    if (cells.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (cells[idx] ?? "").trim(); });
    rows.push(row);
  }
  return { headers: headers.map(h => h.trim()), rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function parseConversionTime(str) {
  if (!str) return null;
  // "2026/06/01 19:48:29" or "2026-06-01 07:30:00"
  const s = str.replace(/\//g, "-");
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(d)) return null;
  return Math.floor(d.getTime() / 1000);
}

function fmtEventTime(sec) {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ── Merge logic ───────────────────────────────────────────────────────────────
// Join key: FuseClick["Transaction ID"] === Conversions["transaction_id"]
// Source of truth:
//   Purchase/revenue/value, IP, location, device → Conversions
//   fbc, campaign/adset/creative info, browser UA → FuseClick

function extractFbc(subId5, subId6) {
  // Sub ID 5 often contains the fb.1.{ms}.{fbclid} token or the button click id
  // Sub ID 6 contains the full fbc string
  if (subId6 && subId6.startsWith("fb.")) return subId6;
  if (subId5 && subId5.startsWith("fb.")) return subId5;
  return subId6 || subId5 || "";
}

function extractFbp(subId6) {
  // fbp looks like fb.1.{timestamp}.{rand}
  if (subId6 && subId6.startsWith("fb.1.")) return subId6;
  return "";
}

function mapEventName(convEventName, fuseEventName) {
  // Conversions report event_name is the source — but for CAPI we want Meta-friendly names
  const n = (convEventName || fuseEventName || "").toLowerCase();
  if (n.includes("base") || n.includes("purchase") || n.includes("sale")) return "Purchase";
  if (n.includes("lead") || n.includes("ctc") || n.includes("click")) return "Lead";
  if (n.includes("init") || n.includes("learn more")) return "ViewContent";
  return convEventName || fuseEventName || "Purchase";
}

function mergeReports(fuseRows, convRows) {
  // Build lookup: transaction_id → FuseClick row(s)
  const fuseByTxn = {};
  for (const r of fuseRows) {
    const txn = (r["Transaction ID"] || "").trim();
    if (!txn) continue;
    if (!fuseByTxn[txn]) fuseByTxn[txn] = [];
    fuseByTxn[txn].push(r);
  }

  const merged = [];
  const seen = new Set();

  for (const conv of convRows) {
    const txn = (conv["transaction_id"] || "").trim();
    const fuseMatches = txn ? (fuseByTxn[txn] || []) : [];
    const fuse = fuseMatches[0] || null;

    // Deduplicate: one row per (transaction_id + event_id combo)
    const dedupeKey = `${txn}__${conv["event_id"] || conv["conversion_id"]}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Timestamps — Conversions date is truth for actual conversion time
    const eventTimeSec = parseConversionTime(conv["date"]) || parseConversionTime(fuse?.["Conversion Time"]);

    // Location — Conversions is truth
    const city = (conv["city"] || "").toLowerCase().replace(/\s+/g, "");
    const state = (conv["region"] || "").toLowerCase().replace(/\s+/g, "");
    const country = (conv["country_code"] || conv["country"] || "US").toLowerCase().slice(0, 2);

    // Revenue / value
    const value = parseFloat(conv["revenue"] || conv["sale_amount"] || "0") || 0;
    const currency = (conv["currency_id"] || "USD").trim();

    // Event name mapping
    const eventName = mapEventName(conv["event_name"], fuse?.["Event Name"]);

    // IP & UA — Conversions is truth
    const clientIp = (conv["session_user_ip"] || conv["conversion_user_ip"] || "").trim();
    const clientUa = (conv["http_user_agent"] || fuse?.["User Agent"] || "").trim();

    // fbc — FuseClick Sub IDs are truth
    const sub5 = fuse?.["Sub ID 5"] || "";
    const sub6 = fuse?.["Sub ID 6"] || "";
    const fbc = extractFbc(sub5, sub6);
    const fbp = extractFbp(fuse?.["Sub ID 6"] || "");

    // MADID / Device IDs
    const madid = (fuse?.["Device ID"] || conv["idfa"] || conv["google_ad_id"] || conv["android_id"] || "").trim();

    // External ID — use transaction_id as external_id
    const externalId = txn || conv["conversion_id"] || "";

    // Campaign info — FuseClick Sub IDs are truth
    // Sub ID 1 = campaign name, Sub ID 2 = adset name, Sub ID 3 = creative name
    // Sub ID 7 = ad_id, Sub ID 8 = adset_id (120244...), Sub ID 9 = campaign_id (120244...)
    const campaignName = fuse?.["Sub ID 1"] || "";
    const adsetName = fuse?.["Sub ID 2"] || "";
    const creativeName = fuse?.["Sub ID 3"] || "";
    const adId = fuse?.["Sub ID 7"] || "";
    const adsetId = fuse?.["Sub ID 8"] || "";
    const campaignId = fuse?.["Sub ID 9"] || "";

    // Device info
    const deviceType = (conv["device_type"] || fuse?.["Device Type"] || "").trim();
    const brand = (conv["brand"] || fuse?.["Device Brand"] || "").trim();
    const osVersion = (conv["os_version"] || fuse?.["Device OS Version"] || "").trim();
    const browser = (conv["browser"] || "").trim();

    merged.push({
      _txn: txn,
      _convId: conv["conversion_id"] || "",
      _matched: !!fuse,
      event_name: eventName,
      event_time_sec: eventTimeSec,
      event_time: eventTimeSec ? fmtEventTime(eventTimeSec) : "—",
      value: value > 0 ? value.toFixed(2) : "0.00",
      currency,
      email: "",
      phone: "",
      madid,
      external_id: externalId,
      ct: city,
      st: state,
      country,
      fbc,
      fbp,
      client_ip_address: clientIp,
      client_user_agent: clientUa,
      // extra context columns
      campaign_name: campaignName,
      adset_name: adsetName,
      creative_name: creativeName,
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: adId,
      device_type: deviceType,
      brand,
      os_version: osVersion,
      browser,
    });
  }

  // Also include FuseClick rows with no match in Conversions (orphaned click data)
  for (const fuse of fuseRows) {
    const txn = (fuse["Transaction ID"] || "").trim();
    if (!txn) continue;
    const convMatch = convRows.find(c => (c["transaction_id"] || "").trim() === txn);
    if (convMatch) continue; // already processed

    const dedupeKey = `fuse_only__${txn}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const eventTimeSec = parseConversionTime(fuse["Conversion Time"]) || parseConversionTime(fuse["Session Time"]);
    const sub5 = fuse["Sub ID 5"] || "";
    const sub6 = fuse["Sub ID 6"] || "";
    const fbc = extractFbc(sub5, sub6);

    merged.push({
      _txn: txn,
      _convId: "",
      _matched: false,
      event_name: mapEventName("", fuse["Event Name"]),
      event_time_sec: eventTimeSec,
      event_time: eventTimeSec ? fmtEventTime(eventTimeSec) : "—",
      value: "0.00",
      currency: (fuse["Offer Currency"] || "USD").replace(/\s/g, ""),
      email: "",
      phone: "",
      madid: (fuse["Device ID"] || "").trim(),
      external_id: txn,
      ct: (fuse["Click City"] || "").toLowerCase().replace(/\s+/g, ""),
      st: (fuse["Click State"] || "").toLowerCase(),
      country: (fuse["Click Country"] || "US").toLowerCase(),
      fbc,
      fbp: extractFbp(sub6),
      client_ip_address: (fuse["Session IP"] || "").trim(),
      client_user_agent: (fuse["User Agent"] || "").trim(),
      campaign_name: fuse["Sub ID 1"] || "",
      adset_name: fuse["Sub ID 2"] || "",
      creative_name: fuse["Sub ID 3"] || "",
      campaign_id: fuse["Sub ID 9"] || "",
      adset_id: fuse["Sub ID 8"] || "",
      ad_id: fuse["Sub ID 7"] || "",
      device_type: (fuse["Device Type"] || "").trim(),
      brand: (fuse["Device Brand"] || "").trim(),
      os_version: (fuse["Device OS Version"] || "").trim(),
      browser: "",
    });
  }

  // Sort by event_time descending
  merged.sort((a, b) => (b.event_time_sec || 0) - (a.event_time_sec || 0));
  return merged;
}

// ── Export to CSV ─────────────────────────────────────────────────────────────
const EXPORT_COLS = [
  "event_name", "event_time", "value", "currency",
  "email", "phone", "madid", "external_id",
  "ct", "st", "country", "fbc", "fbp",
  "client_ip_address", "client_user_agent",
  "campaign_name", "adset_name", "creative_name",
  "campaign_id", "adset_id", "ad_id",
  "device_type", "brand", "os_version", "browser",
];

function toCSV(rows) {
  const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = EXPORT_COLS.join(",");
  const body = rows.map(r => EXPORT_COLS.map(c => escape(r[c] ?? "")).join(",")).join("\n");
  return header + "\n" + body;
}

function downloadCSV(rows) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capi_merged_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Table columns ─────────────────────────────────────────────────────────────
const TABLE_COLS = [
  { key: "event_name", label: "Event" },
  { key: "event_time", label: "Event Time" },
  { key: "value", label: "Value" },
  { key: "currency", label: "CCY" },
  { key: "client_ip_address", label: "IP" },
  { key: "ct", label: "City" },
  { key: "st", label: "State" },
  { key: "country", label: "Country" },
  { key: "fbc", label: "fbc" },
  { key: "fbp", label: "fbp" },
  { key: "madid", label: "MADID" },
  { key: "external_id", label: "External ID" },
  { key: "campaign_name", label: "Campaign" },
  { key: "adset_name", label: "Ad Set" },
  { key: "creative_name", label: "Creative" },
  { key: "campaign_id", label: "Campaign ID" },
  { key: "adset_id", label: "AdSet ID" },
  { key: "ad_id", label: "Ad ID" },
  { key: "device_type", label: "Device" },
  { key: "brand", label: "Brand" },
  { key: "browser", label: "Browser" },
];

// ── Sort helper ───────────────────────────────────────────────────────────────
function sortRows(rows, col, dir) {
  if (!col) return rows;
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";
    if (col === "value") {
      return (parseFloat(av) - parseFloat(bv)) * mul;
    }
    if (col === "event_time") {
      return ((a.event_time_sec || 0) - (b.event_time_sec || 0)) * mul;
    }
    return String(av).localeCompare(String(bv)) * mul;
  });
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ label, accent, onFile, file, onClear }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const accentMap = {
    fuchsia: {
      border: dragging ? "border-fuchsia-500 bg-fuchsia-50" : "border-fuchsia-200 bg-white hover:border-fuchsia-400 hover:bg-fuchsia-50/40",
      icon: "from-fuchsia-500 to-violet-600",
      tag: "bg-fuchsia-100 text-fuchsia-700",
    },
    sky: {
      border: dragging ? "border-sky-500 bg-sky-50" : "border-sky-200 bg-white hover:border-sky-400 hover:bg-sky-50/40",
      icon: "from-sky-500 to-blue-600",
      tag: "bg-sky-100 text-sky-700",
    },
  }[accent];

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${accentMap.border}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`shrink-0 rounded-full bg-linear-to-br ${accentMap.icon} p-2 text-white`}>
              <FileSpreadsheet size={14} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-ink-900 truncate">{file.name}</p>
              <p className="text-[11px] text-ink-500">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 rounded-full border border-ink-200 bg-white p-1 text-ink-500 hover:bg-ink-50"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className={`rounded-full bg-linear-to-br ${accentMap.icon} p-3 text-white shadow`}>
            <Upload size={18} />
          </div>
          <p className="text-sm font-semibold text-ink-900">{label}</p>
          <p className="text-[11px] text-ink-400">Drop .csv or click to choose</p>
          <button
            onClick={() => inputRef.current?.click()}
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm ${accentMap.icon.replace("from-", "bg-").split(" ")[0]} hover:opacity-90`}
          >
            Choose file
          </button>
        </div>
      )}
    </div>
  );
}

// ── Copy cell ─────────────────────────────────────────────────────────────────
function CopyCell({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <td
      className="px-2 py-1.5 font-mono text-ink-700 max-w-40 truncate group relative cursor-pointer hover:bg-ink-50"
      title={value}
      onClick={copy}
    >
      {value || <span className="text-ink-300">—</span>}
      <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} className="text-ink-400" />}
      </span>
    </td>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ rows }) {
  const matched = rows.filter(r => r._matched).length;
  const purchases = rows.filter(r => r.event_name === "Purchase").length;
  const totalValue = rows.reduce((s, r) => s + parseFloat(r.value || 0), 0);
  const withFbc = rows.filter(r => r.fbc).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total rows", value: rows.length, color: "text-ink-900" },
        { label: "Matched (fuse+conv)", value: `${matched} / ${rows.length}`, color: "text-emerald-700" },
        { label: "Purchases", value: purchases, color: "text-fuchsia-700" },
        { label: "Total revenue", value: `$${totalValue.toFixed(2)}`, color: "text-sky-700" },
        { label: "With fbc", value: withFbc, color: "text-violet-700" },
      ].map(s => (
        <div key={s.label} className="rounded-xl bg-white ring-1 ring-ink-100 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{s.label}</p>
          <p className={`mt-0.5 text-xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CapiPage() {
  const [fuseFile, setFuseFile] = useState(null);
  const [convFile, setConvFile] = useState(null);
  const [fuseParsed, setFuseParsed] = useState(null);
  const [convParsed, setConvParsed] = useState(null);
  const [sort, setSort] = useState({ col: "event_time", dir: "desc" });
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  const readFile = (file, setter) => {
    const reader = new FileReader();
    reader.onload = (e) => setter(parseCSV(e.target.result));
    reader.readAsText(file);
  };

  const handleFuse = (f) => { setFuseFile(f); readFile(f, setFuseParsed); };
  const handleConv = (f) => { setConvFile(f); readFile(f, setConvParsed); };

  const mergedRaw = useMemo(() => {
    if (!fuseParsed && !convParsed) return [];
    const fuseRows = fuseParsed?.rows || [];
    const convRows = convParsed?.rows || [];
    return mergeReports(fuseRows, convRows);
  }, [fuseParsed, convParsed]);

  const filtered = useMemo(() => {
    let rows = mergedRaw;
    if (filter === "purchase") rows = rows.filter(r => r.event_name === "Purchase");
    else if (filter === "matched") rows = rows.filter(r => r._matched);
    else if (filter === "unmatched") rows = rows.filter(r => !r._matched);
    return sortRows(rows, sort.col, sort.dir);
  }, [mergedRaw, filter, sort]);

  const clickHeader = (col) => {
    setSort(s => s.col === col
      ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "desc" }
    );
  };

  const copyAll = () => {
    const csv = toCSV(filtered);
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const hasData = mergedRaw.length > 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700">
            CAPI · Report Merger
          </p>
        }
        title="FuseClick + Conversions Merger"
        sub="Upload both reports below — they merge instantly in-browser. Nothing is stored. Download the result as a ready-to-use CAPI feed for Meta."
      />

      {/* Upload row */}
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700 mb-2">
            FuseClick Report
          </p>
          <p className="text-[11px] text-ink-500 mb-2">
            Source for: fbc, campaign/adset/creative, MADID, browser UA
          </p>
          <DropZone
            label="Upload FuseClick .csv"
            accent="fuchsia"
            file={fuseFile}
            onFile={handleFuse}
            onClear={() => { setFuseFile(null); setFuseParsed(null); }}
          />
          {fuseParsed && (
            <p className="mt-1.5 text-[11px] text-fuchsia-700 font-semibold">
              {fuseParsed.rows.length.toLocaleString()} rows loaded
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 mb-2">
            Conversions Report
          </p>
          <p className="text-[11px] text-ink-500 mb-2">
            Source for: event time, IP, location, revenue, device info
          </p>
          <DropZone
            label="Upload Conversions .csv"
            accent="sky"
            file={convFile}
            onFile={handleConv}
            onClear={() => { setConvFile(null); setConvParsed(null); }}
          />
          {convParsed && (
            <p className="mt-1.5 text-[11px] text-sky-700 font-semibold">
              {convParsed.rows.length.toLocaleString()} rows loaded
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      {hasData && (
        <div className="space-y-4">
          <StatsBar rows={mergedRaw} />

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {[
                { key: "all", label: `All (${mergedRaw.length})` },
                { key: "purchase", label: `Purchases (${mergedRaw.filter(r => r.event_name === "Purchase").length})` },
                { key: "matched", label: `Matched (${mergedRaw.filter(r => r._matched).length})` },
                { key: "unmatched", label: `FuseClick only (${mergedRaw.filter(r => !r._matched).length})` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    filter === f.key
                      ? "bg-ink-900 text-white"
                      : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyAll}
                className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy CSV"}
              </button>
              <button
                onClick={() => downloadCSV(filtered)}
                className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-700 shadow-sm"
              >
                <FileSpreadsheet size={12} />
                Download CSV ({filtered.length.toLocaleString()} rows)
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-100 overflow-hidden">
            <div className="overflow-x-auto max-h-145">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ink-50 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left text-ink-500 font-semibold whitespace-nowrap">#</th>
                    <th className="px-2 py-2 text-left text-ink-500 font-semibold whitespace-nowrap">M</th>
                    {TABLE_COLS.map(c => {
                      const active = sort.col === c.key;
                      return (
                        <th
                          key={c.key}
                          onClick={() => clickHeader(c.key)}
                          className={`px-2 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none transition-colors ${
                            active ? "text-ink-900" : "text-ink-500 hover:text-ink-700"
                          }`}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {c.label}
                            {active
                              ? sort.dir === "asc"
                                ? <ChevronUp size={10} />
                                : <ChevronDown size={10} />
                              : <ArrowUpDown size={9} className="text-ink-300" />
                            }
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((row, i) => (
                    <tr
                      key={`${row._txn}-${row._convId}-${i}`}
                      className={`border-t border-ink-100 hover:bg-fuchsia-50/30 ${
                        row.event_name === "Purchase" ? "bg-emerald-50/20" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 text-ink-400 font-mono">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${row._matched ? "bg-emerald-500" : "bg-amber-400"}`} title={row._matched ? "Matched" : "FuseClick only"} />
                      </td>
                      {TABLE_COLS.map(c => (
                        <CopyCell key={c.key} value={String(row[c.key] ?? "")} />
                      ))}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={TABLE_COLS.length + 2} className="px-4 py-8 text-center text-ink-400">
                        No rows in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 500 && (
              <p className="px-4 py-2 text-[11px] text-ink-400 border-t border-ink-100 text-center">
                Showing first 500 of {filtered.length.toLocaleString()} rows. Full export includes all.
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[11px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Matched — both reports joined on transaction_id
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> FuseClick only — no Conversions row found
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-emerald-50" /> Green row = Purchase event
            </span>
            <span>Click any cell to copy its value.</span>
          </div>
        </div>
      )}

      {!hasData && (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-12 text-center text-ink-400">
          <p className="text-sm font-semibold">Upload at least one report above to see the merged table.</p>
          <p className="text-[11px] mt-1">You can upload just one file — it will still show what data is available.</p>
        </div>
      )}
    </>
  );
}
