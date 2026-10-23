// GET /api/journey/export-lookalike?format=offline_events
// GET /api/journey/export-lookalike?format=customer_file&onlyConverted=1
//
// Two Meta-documented file formats, picked by the `format` query param.
// Both are produced as .xlsx that Ads Manager accepts directly.
//
// ── format=offline_events  (default) ───────────────────────────────────
//   The Offline Events / Conversions-API source format. One row per
//   conversion event. Designed for upload to Meta → Events Manager →
//   Offline Event Set, which can then be turned into a Custom Audience
//   that seeds a Lookalike.
//
//   Column set follows the Conversions API "user_data" + offline event
//   schema (lowercase headers Meta's auto-detector recognises):
//     event_name, event_time, value, currency,
//     email, phone, madid, external_id,
//     ct, st, country,                    (SHA-256 hashed, lowercased)
//     client_ip_address, client_user_agent, fbc
//   plus a few non-Meta context columns for human review.
//
// ── format=customer_file ───────────────────────────────────────────────
//   Customer File Custom Audience format. One row per unique visitor.
//   Same hashed identifier columns Ads Manager auto-maps; no event_time
//   or value column. Use this when you want a static seed list rather
//   than an event-driven audience.
//
// Hashing rules per Meta:
//   • PII fields (city, state, country, name, email, phone, dob) must be
//     SHA-256 hashed AFTER lowercasing and trimming. Country must first
//     be normalised to ISO-2 lowercase ("US" → "us").
//   • madid is sent raw (lowercase GUID).
//   • client_ip_address, client_user_agent, fbc, fbp are sent raw.
//   • external_id can be raw or hashed; we hash for consistency.
//
// `fbc` (Facebook Click ID cookie) format: `fb.{subdomain}.{ts_ms}.{fbclid}`.
// We use subdomain index 1 (com domains) and the originating click's
// timestamp in milliseconds.

import crypto from "node:crypto";
import ExcelJS from "exceljs";
import {
  getOfflineEventRows,
  getCustomerFileRows,
} from "@/lib/journey/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── helpers ─────────────────────────────────────────────────────────
function sha256(v) {
  if (v == null || v === "") return "";
  return crypto
    .createHash("sha256")
    .update(String(v).toLowerCase().trim())
    .digest("hex");
}

function normCountry(v) {
  if (!v) return "";
  return String(v).trim().toLowerCase();
}

// MySQL DATETIME strings come back as "YYYY-MM-DD HH:MM:SS" (no Z) when
// the pool is configured with `dateStrings: true`. JS parses such strings
// as LOCAL time, so on a server running in IST a stored UTC "10:59:21"
// would emit a Unix epoch 5.5 hours off. We always append Z so the value
// is interpreted as UTC — which is what we wrote into the DB.
function dbDateMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d) ? null : d.getTime();
}

function fbcOf(fbclid, clickTime) {
  if (!fbclid) return "";
  const ts = dbDateMs(clickTime);
  if (ts == null || !Number.isFinite(ts)) return "";
  return `fb.1.${ts}.${fbclid}`;
}

// Conv-report event names → Meta Standard Events (so Ads Manager treats
// them properly for attribution + audience building). Unknown names pass
// through unchanged — Meta accepts custom event names too.
const STANDARD_EVENT = {
  Base: "Purchase",
  "Learn More Clicked": "Lead",
  "CTC Clicked": "Contact",
  InitialEvent: "ViewContent",
  "Initial Event": "ViewContent",
  Click: "Lead",
};
function mapEventName(name) {
  if (!name) return "Lead";
  return STANDARD_EVENT[name] || name;
}

function pickMadid(r) {
  const raw = r.idfa || r.google_ad_id || r.android_id;
  return raw ? String(raw).toLowerCase() : "";
}

// Common XLSX scaffolding so both formats look the same.
function newWorkbook(name) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "facebook-ads dashboard";
  wb.created = new Date();
  wb.subject = name;
  return wb;
}

// ── format=offline_events ───────────────────────────────────────────
async function buildOfflineEvents() {
  const rows = await getOfflineEventRows();
  const HEADERS = [
    "event_name", // mapped standard event
    "event_time", // Unix seconds UTC
    "value",
    "currency",
    "email", // blank (no PII available)
    "phone",
    "madid",
    "external_id", // SHA-256(transaction_id || ip)
    "ct", // SHA-256(lowercase city) — Meta's column name for City
    "st", // SHA-256(lowercase state) — Meta's column name for State
    "country", // SHA-256(ISO-2 lowercase) — Meta's column name for Country
    "client_ip_address",
    "client_user_agent",
    "fbc", // fb.1.{ts_ms}.{fbclid}
    // ── Plain-text review columns (Meta's auto-mapper ignores names it
    //    doesn't recognise — underscore prefix makes that doubly safe).
    //    Useful so you can eyeball "ct" hashed value === "New Bedford" etc.
    "_review_city",
    "_review_state",
    "_review_country",
    "_review_event", // original conv-report event name pre-mapping
    "_review_language",
    "_review_platform",
    "_review_device",
  ];

  const wb = newWorkbook("Meta Offline Events");
  const ws = wb.addWorksheet("offline_events");
  ws.columns = HEADERS.map((h) => ({ header: h, key: h, width: 18 }));

  for (const r of rows) {
    const ms = dbDateMs(r.event_time);
    ws.addRow({
      event_name: mapEventName(r.event_name),
      event_time: ms != null && Number.isFinite(ms) ? Math.floor(ms / 1000) : "",
      value: r.value != null ? Number(r.value) : "",
      currency: r.currency || "USD",
      email: "",
      phone: "",
      madid: pickMadid(r),
      external_id: sha256(r.transaction_id || r.ip),
      ct: sha256(r.city),
      st: sha256(r.state),
      country: sha256(normCountry(r.country)),
      client_ip_address: r.ip || "",
      client_user_agent: r.user_agent || "",
      fbc: fbcOf(r.fbclid, r.click_time),
      _review_city: r.city || "",
      _review_state: r.state || "",
      _review_country: r.country || "",
      _review_event: r.event_name || "",
      _review_language: r.language || "",
      _review_platform: r.platform || "",
      _review_device: r.device_type || "",
    });
  }
  return { wb, count: rows.length, name: "meta-offline-events" };
}

// ── format=customer_file ────────────────────────────────────────────
async function buildCustomerFile(onlyConverted) {
  const rows = await getCustomerFileRows({ onlyConverted });
  const HEADERS = [
    "email",
    "phone",
    "fn",
    "ln",
    "madid",
    "extern_id",
    "ct",
    "st",
    "zip",
    "country",
    "dob",
    "doby",
    "gen",
    // ── CAPI signal columns (also accepted on customer-file rows) ──
    "client_ip_address",
    "client_user_agent",
    "fbc",
    // ── Plain-text review columns (Meta ignores) ──
    "_review_city",
    "_review_state",
    "_review_country",
    "_review_device",
    "click_count",
    "conv_count",
    "conv_revenue",
  ];

  const wb = newWorkbook("Meta Customer File");
  const ws = wb.addWorksheet("customer_file");
  ws.columns = HEADERS.map((h) => ({ header: h, key: h, width: 18 }));

  for (const r of rows) {
    ws.addRow({
      email: "",
      phone: "",
      fn: "",
      ln: "",
      madid: pickMadid(r),
      extern_id: sha256(r.latest_tx || r.ip),
      ct: sha256(r.city),
      st: sha256(r.state),
      zip: "",
      country: sha256(normCountry(r.country)),
      dob: "",
      doby: "",
      gen: "",
      client_ip_address: r.ip || "",
      client_user_agent: r.user_agent || "",
      fbc: fbcOf(r.fbclid, r.click_time || r.last_click_at),
      click_count: r.click_count || 0,
      conv_count: r.conv_count || 0,
      conv_revenue: r.conv_revenue != null ? Number(r.conv_revenue) : "",
    });
  }
  return { wb, count: rows.length, name: "meta-customer-file" };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "offline_events";
  const onlyConverted = searchParams.get("onlyConverted") === "1";

  let result;
  if (format === "customer_file") {
    result = await buildCustomerFile(onlyConverted);
  } else {
    result = await buildOfflineEvents();
  }

  const { wb, count, name } = result;
  const ws = wb.worksheets[0];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "left" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${name}-${today}-${count}rows.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
