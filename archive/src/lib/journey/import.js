// Server-side CSV parsing + DB writers for the journey section.
//
// Mirrors what scripts/import-journey.mjs does, but designed to be called
// from a route handler so the user can upload fresh paychat + conv reports
// via the UI instead of running a CLI script.
//
// Why two TZ identifiers?
//   • paychat (Fuse Click Report)   → recorded in IST (Asia/Kolkata)
//   • conv report (offline export)  → recorded in PST/PDT (America/Los_Angeles)
// We use Intl.DateTimeFormat against IANA tzdata so DST flips are handled
// correctly (e.g. PST→PDT in early March). Both end up as true UTC in the
// DB so the unified timeline + the Meta `event_time` export are correct
// regardless of the server's local clock.

import { exec } from "@/lib/db";

const TZ_FUSE = "Asia/Kolkata";        // IST, fixed offset +5:30
const TZ_CONV = "America/Los_Angeles"; // PST/PDT, DST-aware

// ── timezone helpers ─────────────────────────────────────────────────
function tzOffsetMinutes(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const h = map.hour === "24" ? "00" : map.hour;
  const asLocal = Date.UTC(
    +map.year, +map.month - 1, +map.day,
    +h, +map.minute, +map.second,
  );
  return (asLocal - date.getTime()) / 60000;
}

export function parseInTZ(v, timeZone) {
  if (!v) return null;
  const s = String(v).replace(/\//g, "-").trim();
  if (!s) return null;
  const naive = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  if (isNaN(naive)) return null;
  const offMin = tzOffsetMinutes(naive, timeZone);
  const utc = new Date(naive.getTime() - offMin * 60000);
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

// ── CSV parser (BOM-safe, quoted-comma-safe) ─────────────────────────
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { inQuotes = false; continue; }
      field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toObjects(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length === 1 && rows[i][0] === "") continue;
    const o = {};
    for (let j = 0; j < headers.length; j++) o[headers[j]] = rows[i][j] ?? "";
    records.push(o);
  }
  return { headers, records };
}

// Identifies which report this CSV is by looking at the header row.
// Conv files start with `conversion_id, transaction_id, date, ...`.
// Fuse paychat files have a `"Affiliate Click ID"` column with the fbclid.
export function detectKind(headers) {
  const set = new Set(headers);
  if (set.has("conversion_id") && set.has("transaction_id")) return "conv";
  if (set.has("Affiliate Click ID") && set.has("Session Time")) return "fuse";
  return null;
}

// ── coercion helpers ────────────────────────────────────────────────
function num(v) {
  if (v == null || v === "") return null;
  const s = String(v).replace(/[$,]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function str(v, max = 255) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// ── inserters ───────────────────────────────────────────────────────
const FUSE_COLS = [
  "offer_name","affiliate_name","sub_affiliate_id","event_id","event_name",
  "traffic_source","sub_id_1","sub_id_2","affiliate_click_id",
  "device_id","device_type","device_brand","device_model",
  "device_os","device_os_version","carrier","transaction_id",
  "click_country","click_state","click_city",
  "tracking_link_referral","session_ip","browser","session_time",
  "payout","revenue","conversion_ip","conversion_time",
  "conversion_message","status","raw",
];

export async function importFuseRows(records) {
  const ph = `(${FUSE_COLS.map(() => "?").join(",")})`;
  const updateSet = FUSE_COLS
    .filter((c) => c !== "transaction_id" && c !== "session_time")
    .map((c) => `${c} = VALUES(${c})`)
    .join(", ");
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const r of slice) {
      values.push(ph);
      params.push(
        str(r["Offer Name"], 255),
        str(r["Affiliate Name"], 255),
        str(r["Sub Affiliate ID"], 128),
        str(r["Event ID"], 64),
        str(r["Event Name"], 128),
        str(r["Traffic source"], 64),
        str(r["Sub ID 1"], 255),
        str(r["Sub ID 2"], 255),
        str(r["Affiliate Click ID"], 512),
        str(r["Device ID"], 128),
        str(r["Device Type"], 64),
        str(r["Device Brand"], 64),
        str(r["Device Model"], 128),
        str(r["Device OS"], 64),
        str(r["Device OS Version"], 64),
        str(r["Carrier"], 128),
        str(r["Transaction ID"], 128),
        str(r["Click Country"], 8),
        str(r["Click State"], 128),
        str(r["Click City"], 128),
        str(r["Tracking Link Referral"], 512),
        str(r["Session IP"], 64),
        str(r["Browser"], 128),
        parseInTZ(r["Session Time"], TZ_FUSE),
        num(r["Payout"]),
        num(r["Revenue"]),
        str(r["Conversion IP"], 64),
        parseInTZ(r["Conversion Time"], TZ_FUSE),
        str(r["Conversion Message"], 512),
        str(r["Status"], 64),
        JSON.stringify(r),
      );
    }
    if (values.length === 0) continue;
    await exec(
      `INSERT INTO journey_clicks (${FUSE_COLS.join(",")})
       VALUES ${values.join(",")}
       ON DUPLICATE KEY UPDATE ${updateSet}`,
      params,
    );
    inserted += values.length;
  }
  return inserted;
}

const CONV_COLS = [
  "conversion_id","transaction_id","conv_date","click_date","delta_hours",
  "offer_id","offer_name","creative_id","event_id","event_name",
  "revenue","revenue_type","source_id","sub1","sub2","sub3","sub4","sub5",
  "session_user_ip","conversion_user_ip","user_agent",
  "country","country_code","region","city","dma","carrier",
  "platform","os_version","device_type","brand","browser","language","isp",
  "referer","idfa","google_ad_id","android_id","currency_id",
  "sale_amount","network_id","raw",
];

export async function importConvRows(records) {
  const ph = `(${CONV_COLS.map(() => "?").join(",")})`;
  const updateSet = CONV_COLS
    .filter((c) => c !== "conversion_id")
    .map((c) => `${c} = VALUES(${c})`)
    .join(", ");
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const r of slice) {
      if (!r.conversion_id) continue;
      values.push(ph);
      params.push(
        str(r.conversion_id, 128),
        str(r.transaction_id, 128),
        parseInTZ(r.date, TZ_CONV),
        parseInTZ(r.click_date, TZ_CONV),
        num(r.delta_hours),
        str(r.offer_id, 64),
        str(r.offer_name, 255),
        str(r.creative_id, 64),
        str(r.event_id, 64),
        str(r.event_name, 128),
        num(r.revenue),
        str(r.revenue_type, 64),
        str(r.source_id, 64),
        str(r.sub1, 255), str(r.sub2, 255), str(r.sub3, 255),
        str(r.sub4, 255), str(r.sub5, 255),
        str(r.session_user_ip, 64),
        str(r.conversion_user_ip, 64),
        r.http_user_agent || null,
        str(r.country, 128),
        str(r.country_code, 8),
        str(r.region, 128),
        str(r.city, 128),
        str(r.dma, 32),
        str(r.carrier, 128),
        str(r.platform, 64),
        str(r.os_version, 64),
        str(r.device_type, 64),
        str(r.brand, 64),
        str(r.browser, 128),
        str(r.language, 32),
        str(r.isp, 255),
        str(r.referer, 512),
        str(r.idfa, 128),
        str(r.google_ad_id, 128),
        str(r.android_id, 128),
        str(r.currency_id, 8),
        num(r.sale_amount),
        str(r.network_id, 64),
        JSON.stringify(r),
      );
    }
    if (values.length === 0) continue;
    await exec(
      `INSERT INTO journey_conversions (${CONV_COLS.join(",")})
       VALUES ${values.join(",")}
       ON DUPLICATE KEY UPDATE ${updateSet}`,
      params,
    );
    inserted += values.length;
  }
  return inserted;
}
