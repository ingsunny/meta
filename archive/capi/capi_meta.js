/**
 * ============================================================
 *  Meta Conversions API — Purchase Event Sender
 *  Medicare Lookalike Feed | Dataset 1522348796155515
 * ============================================================
 *
 *  Reads your daily aggregated file (xlsx or csv) and sends
 *  Purchase events to Meta CAPI.
 *
 *  Your file columns (all already correctly formatted):
 *    event_name          — "Purchase"
 *    event_time          — Unix timestamp (seconds)
 *    value               — Revenue in USD (e.g. 10.58)
 *    currency            — "USD"
 *    external_id         — SHA-256 hashed session ID
 *    ct                  — SHA-256 hashed city (lowercase)
 *    st                  — SHA-256 hashed state abbreviation
 *    country             — SHA-256 hashed country code
 *    client_ip_address   — Raw IP (NOT hashed)
 *    client_user_agent   — Raw user agent string (NOT hashed)
 *    fbc                 — Raw fbclid cookie (NOT hashed)
 *    event_source_url    — OPTIONAL: full landing URL with UTM params
 *                          If present → sent. If absent → omitted.
 *
 * ============================================================
 *  SETUP
 * ============================================================
 *    npm install xlsx dotenv
 *    (Node 18+ has native fetch. Older Node: npm install node-fetch)
 *
 *  Create a .env file in the same folder:
 *    META_CAPI_TOKEN=your_access_token_here
 *    META_PIXEL_ID=1522348796155515
 *
 *  Never hardcode your token. Never commit .env to git.
 *
 * ============================================================
 *  USAGE
 * ============================================================
 *  Step 1 — TEST first (safe, shows up in Test Events tab only):
 *    node capi_send.js --file "today_purchases.xlsx" --test TEST12345
 *
 *  Step 2 — Verify in Events Manager > Test Events tab
 *
 *  Step 3 — Go LIVE (fires real events, cannot be undone):
 *    node capi_send.js --file "today_purchases.xlsx"
 *
 *  Optional flags:
 *    --pixel PIXEL_ID    override pixel (default: from .env)
 *    --dry               print payloads to console, send nothing
 *    --force             bypass the already-sent safety check
 *
 *  Safety check:
 *    Every successful live send is logged to capi_sent.log
 *    in the same folder. If you try to run the same filename
 *    again the script will abort unless you pass --force.
 *    Dry runs and test runs are never logged.
 * ============================================================
 */

"use strict";

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const rl = require("readline");
const XLSX = require("xlsx");
require("dotenv").config();

// ── CONFIG ────────────────────────────────────────────────────────────────────
const PIXEL_ID = process.env.META_PIXEL_ID || "1522348796155515";
const API_VERSION = "v20.0";
const BATCH_SIZE = 100; // Meta max is 1000, 100 is safer
const BATCH_DELAY_MS = 400; // ~150 req/min stays well under limits
const MAX_AGE_DAYS = 7; // Meta hard limit for real-time events
const FALLBACK_URL = "https://your-medicare.co/";
const ACTION_SOURCE = "website";
const SENT_LOG = path.join(__dirname, "capi_sent.log");
// ─────────────────────────────────────────────────────────────────────────────

// ── ARG PARSER ────────────────────────────────────────────────────────────────
function parseArgs() {
  const map = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      map[key] =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return map;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
/** Trim + null-out empty / NaN strings */
function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "nan" ? null : s;
}

/** Sleep ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Interactive yes/no prompt */
function confirm(question) {
  return new Promise((resolve) => {
    const iface = rl.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    iface.question(question, (ans) => {
      iface.close();
      resolve(ans.trim());
    });
  });
}

/** Load xlsx or csv → array of row objects */
function loadFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const wb = XLSX.readFile(filePath, { raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

// ── SENT LOG ──────────────────────────────────────────────────────────────────
/** Returns set of already-sent filenames (basename only) */
function readSentLog() {
  try {
    if (!fs.existsSync(SENT_LOG)) return new Set();
    const lines = fs
      .readFileSync(SENT_LOG, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return new Set(
      lines
        .map((l) => {
          // Each line: "2026-05-29T10:30:00Z | purchases_may29.xlsx | 36 events"
          const parts = l.split("|");
          return parts[1] ? parts[1].trim() : "";
        })
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/** Append a successful send to the log */
function writeSentLog(filename, eventCount) {
  const ts = new Date().toISOString();
  const base = path.basename(filename);
  const line = `${ts} | ${base} | ${eventCount} events\n`;
  fs.appendFileSync(SENT_LOG, line, "utf8");
}
// ─────────────────────────────────────────────────────────────────────────────

// ── EVENT BUILDER ─────────────────────────────────────────────────────────────
/**
 * Converts one spreadsheet row into a Meta CAPI event object.
 *
 * user_data fields:
 *   - raw (no hashing needed):  client_ip_address, client_user_agent, fbc
 *   - pre-hashed by you:        external_id, ct, st, country, em, ph, madid
 *
 * event_source_url:
 *   - Sent ONLY if the row has a non-empty event_source_url column.
 *   - Falls back to FALLBACK_URL only when you explicitly want a fallback
 *     (controlled by the includeFallbackUrl flag below).
 */
function buildEvent(row, { includeFallbackUrl = false } = {}) {
  // ── user_data ──────────────────────────────────────────────────────────────
  const userData = {};

  // Raw fields — Meta does NOT want these hashed
  const rawFields = [
    ["client_ip_address", "client_ip_address"],
    ["client_user_agent", "client_user_agent"],
    ["fbc", "fbc"],
  ];
  for (const [col, key] of rawFields) {
    const v = clean(row[col]);
    if (v) userData[key] = v;
  }

  // Pre-hashed fields — send as-is
  const hashedFields = [
    ["external_id", "external_id"],
    ["ct", "ct"], // city hash
    ["st", "st"], // state hash
    ["country", "country"],
    ["email", "em"], // null in your current data, future-proof
    ["phone", "ph"],
    ["madid", "madid"],
  ];
  for (const [col, key] of hashedFields) {
    const v = clean(row[col]);
    if (v) userData[key] = v;
  }

  // ── custom_data (value + currency) ────────────────────────────────────────
  const customData = {};
  const val = clean(row.value);
  const cur = clean(row.currency);
  if (val && !isNaN(parseFloat(val))) customData.value = parseFloat(val);
  if (cur) customData.currency = cur.toUpperCase();

  // ── event_source_url ──────────────────────────────────────────────────────
  //   Rule: use row value if present, otherwise only fall back if flag is set.
  const rowUrl = clean(row.event_source_url);
  const sourceUrl = rowUrl ? rowUrl : includeFallbackUrl ? FALLBACK_URL : null;

  // ── assemble event ─────────────────────────────────────────────────────────
  const event = {
    event_name: clean(row.event_name) || "Purchase",
    event_time: parseInt(clean(row.event_time), 10),
    action_source: ACTION_SOURCE,
    event_id: crypto.randomUUID(), // unique per send; prevents re-upload dupes
    user_data: userData,
  };

  if (sourceUrl) event.event_source_url = sourceUrl;
  if (Object.keys(customData).length) event.custom_data = customData;

  return event;
}

// ── BATCH SENDER ──────────────────────────────────────────────────────────────
async function sendBatch(
  events,
  { token, pixelId, testCode, batchNum, total, dry },
) {
  const apiUrl = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`;
  const body = { data: events, access_token: token };
  if (testCode) body.test_event_code = testCode;

  if (dry) {
    console.log(
      `  [DRY] Batch ${batchNum}/${total} — would send ${events.length} events`,
    );
    console.log("  Payload preview (first event):");
    console.log(
      "  " + JSON.stringify(events[0], null, 2).split("\n").join("\n  "),
    );
    return events.length;
  }

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await resp.json();

    if (!resp.ok) {
      console.log(
        `  ❌ Batch ${batchNum}/${total} FAILED  (HTTP ${resp.status})`,
      );
      if (res.error) {
        console.log(`     ${res.error.message}`);
        if (res.error.error_user_msg)
          console.log(`     → ${res.error.error_user_msg}`);
        if (res.error.error_subcode)
          console.log(`     subcode: ${res.error.error_subcode}`);
        if (res.error.fbtrace_id)
          console.log(`     fbtrace_id: ${res.error.fbtrace_id}`);
      }
      // Save first failing batch payload for debugging
      if (batchNum === 1) {
        fs.writeFileSync("debug_payload.json", JSON.stringify(body, null, 2));
        console.log("     → Saved to debug_payload.json for inspection");
      }
      return 0;
    }

    const recv = res.events_received ?? 0;
    const trace = res.fbtrace_id ? `  [fbtrace ${res.fbtrace_id}]` : "";
    console.log(
      `  ✅ Batch ${batchNum}/${total}  ${recv}/${events.length} received${trace}`,
    );
    if (res.messages?.length) {
      res.messages.forEach((m) => console.log(`     ⚠️  ${m}`));
    }
    return recv;
  } catch (err) {
    console.log(
      `  ❌ Batch ${batchNum}/${total} network error: ${err.message}`,
    );
    return 0;
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  // ── validate inputs ────────────────────────────────────────────────────────
  if (!args.file) {
    console.log(
      [
        "",
        "Usage:",
        "  node capi_send.js --file <path>  [--test TESTCODE]  [--pixel PIXELID]  [--dry]  [--force]",
        "",
        "Examples:",
        "  node capi_send.js --file purchases_may29.xlsx --test TEST12345",
        "  node capi_send.js --file purchases_may29.xlsx",
        "  node capi_send.js --file purchases_may29.csv  --dry",
        "  node capi_send.js --file purchases_may29.xlsx  --force  # bypass duplicate check",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (!fs.existsSync(args.file)) {
    console.log(`❌ File not found: ${args.file}`);
    process.exit(1);
  }

  // ── resolve flags early (needed for sent log check) ─────────────────────────
  const isDry_early = !!args.dry;
  const isForce = !!args.force;

  // ── sent log safety check ─────────────────────────────────────────────────
  if (!isDry_early && !isForce) {
    const sentFiles = readSentLog();
    const basename = path.basename(args.file);
    if (sentFiles.has(basename)) {
      console.log(
        [
          "",
          `❌ Already sent: ${basename}`,
          "   This file has been fired before (logged in capi_sent.log).",
          "   Re-sending will create DUPLICATE events in Meta.",
          "   If you are sure, re-run with --force to override.",
          "",
        ].join("\n"),
      );
      process.exit(1);
    }
  }
  if (isForce) {
    console.log("  ⚠️  --force flag set — skipping duplicate check\n");
  }

  const token = process.env.META_CAPI_TOKEN;
  if (!token && !args.dry) {
    console.log(
      [
        "❌ Access token missing.",
        "   Add to .env:  META_CAPI_TOKEN=your_token_here",
        "   Or export:    export META_CAPI_TOKEN=your_token_here",
      ].join("\n"),
    );
    process.exit(1);
  }

  const pixelId = args.pixel || PIXEL_ID;
  const testCode = typeof args.test === "string" ? args.test : null;
  const isDry = isDry_early;
  const mode = isDry
    ? "DRY RUN"
    : testCode
      ? `TEST  [code: ${testCode}]`
      : "LIVE ⚠️";

  // ── load + filter rows ─────────────────────────────────────────────────────
  const rows = loadFile(args.file);
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - MAX_AGE_DAYS * 86400;

  let skippedNoTime = 0;
  let skippedTooOld = 0;
  let skippedNoValue = 0;
  let withFbc = 0;
  let withSourceUrl = 0;
  const events = [];

  for (const row of rows) {
    const tStr = clean(row.event_time);
    if (!tStr) {
      skippedNoTime++;
      continue;
    }

    const t = parseInt(parseFloat(tStr), 10);
    if (t < cutoff) {
      skippedTooOld++;
      continue;
    }

    const val = clean(row.value);
    if (!val || isNaN(parseFloat(val))) {
      skippedNoValue++;
      continue;
    }

    const event = buildEvent(row, { includeFallbackUrl: false });
    events.push(event);

    if (clean(row.fbc)) withFbc++;
    if (clean(row.event_source_url)) withSourceUrl++;
  }

  // ── print summary ──────────────────────────────────────────────────────────
  console.log(
    [
      "",
      "═".repeat(62),
      `  Meta CAPI Sender  —  Pixel ${pixelId}`,
      `  File  : ${args.file}`,
      `  Mode  : ${mode}`,
      "─".repeat(62),
      `  Rows in file         : ${rows.length}`,
      `  Skipped (no time)    : ${skippedNoTime}`,
      `  Skipped (too old)    : ${skippedTooOld}  (> ${MAX_AGE_DAYS} days)`,
      `  Skipped (no value)   : ${skippedNoValue}`,
      `  Ready to send        : ${events.length}`,
      "─".repeat(62),
      `  With fbc (fbclid)    : ${withFbc}  (${events.length ? ((withFbc / events.length) * 100).toFixed(1) : 0}%)`,
      `  With event_source_url: ${withSourceUrl}  (${events.length ? ((withSourceUrl / events.length) * 100).toFixed(1) : 0}%)`,
      "═".repeat(62),
      "",
    ].join("\n"),
  );

  if (events.length === 0) {
    console.log(
      "❌ Nothing to send. Check your file has recent events (< 7 days old).\n",
    );
    process.exit(1);
  }

  // ── confirm live send ──────────────────────────────────────────────────────
  if (!isDry && !testCode) {
    const ans = await confirm(
      "  Type FIRE to send live events (cannot be undone): ",
    );
    if (ans !== "FIRE") {
      console.log("  Aborted.\n");
      process.exit(0);
    }
    console.log();
  }

  // ── send in batches ────────────────────────────────────────────────────────
  const totalBatches = Math.ceil(events.length / BATCH_SIZE);
  let totalRecv = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const chunk = events.slice(i, i + BATCH_SIZE);
    console.log(
      `Sending batch ${batchNum}/${totalBatches}  (${chunk.length} events)...`,
    );
    totalRecv += await sendBatch(chunk, {
      token,
      pixelId,
      testCode,
      dry: isDry,
      batchNum,
      total: totalBatches,
    });
    if (i + BATCH_SIZE < events.length) await sleep(BATCH_DELAY_MS);
  }

  // ── final summary ──────────────────────────────────────────────────────────
  console.log(
    [
      "",
      "═".repeat(62),
      `  Done.  ${totalRecv} / ${events.length} events received by Meta.`,
      isDry
        ? "  (Dry run — nothing was actually sent)"
        : testCode
          ? `  → Check: Events Manager > Test Events  [code: ${testCode}]`
          : "  → Check: Events Manager > Overview",
      "═".repeat(62),
      "",
    ].join("\n"),
  );

  // ── log successful live send ────────────────────────────────────────────────
  if (!isDry && !testCode && totalRecv > 0) {
    writeSentLog(args.file, totalRecv);
    console.log(`  📝 Logged to capi_sent.log\n`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
