#!/usr/bin/env node
// One-shot migration from the old file-based JSON store to MySQL.
//
//   data/analytics/campaigns.json        → analytics_campaigns + analytics_uploads
//   data/analytics/events/{id}.json      → analytics_events (batched)
//   data/tracker/settings.json           → tracker_settings
//   data/tracker/names.json              → tracker_names + tracker_sync_meta
//
// Safe to re-run: rows are upserted (INSERT … ON DUPLICATE KEY UPDATE).
//
// Usage: npm run db:migrate

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "meta-ads",
  waitForConnections: true,
  charset: "utf8mb4",
});

async function exec(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

const root = process.cwd();
const ANA_FILE  = path.join(root, "data", "analytics", "campaigns.json");
const ANA_EVENTS_DIR = path.join(root, "data", "analytics", "events");
const TRK_SETTINGS = path.join(root, "data", "tracker", "settings.json");
const TRK_NAMES    = path.join(root, "data", "tracker", "names.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function toMySqlDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function num(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v, max = 255) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

async function migrateAnalytics() {
  const campaigns = readJson(ANA_FILE, []);
  console.log(`Analytics: ${campaigns.length} campaigns to import`);

  for (const c of campaigns) {
    await exec(
      `INSERT INTO analytics_campaigns
         (id, name, created_at, last_upload_at, linked_metas, meta)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         last_upload_at = VALUES(last_upload_at),
         linked_metas = VALUES(linked_metas),
         meta = VALUES(meta)`,
      [
        c.id,
        c.name,
        toMySqlDate(c.createdAt) || toMySqlDate(new Date().toISOString()),
        toMySqlDate(c.lastUploadAt),
        JSON.stringify(c.linkedMetas || (c.linkedMeta ? [c.linkedMeta] : [])),
        JSON.stringify({}),
      ],
    );

    const uploads = Array.isArray(c.uploads) ? c.uploads : [];
    for (const u of uploads) {
      await exec(
        `INSERT INTO analytics_uploads
           (id, campaign_id, filename, uploaded_at, rows_read, added, duplicates, skipped, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           filename = VALUES(filename),
           rows_read = VALUES(rows_read),
           added = VALUES(added),
           duplicates = VALUES(duplicates),
           skipped = VALUES(skipped),
           enabled = VALUES(enabled)`,
        [
          u.id,
          c.id,
          u.filename || null,
          toMySqlDate(u.uploadedAt) || toMySqlDate(new Date().toISOString()),
          u.rowsRead || 0,
          u.added || 0,
          u.duplicates || 0,
          u.skipped || 0,
          u.enabled === false ? 0 : 1,
        ],
      );
    }

    const eventsFile = path.join(ANA_EVENTS_DIR, `${c.id}.json`);
    const events = readJson(eventsFile, []);
    if (events.length === 0) continue;

    console.log(`  ${c.id}: ${events.length} events`);

    let legacyId = null;
    if (!events.every((e) => e._uploadId)) {
      if (uploads.length > 0) {
        legacyId = uploads
          .slice()
          .sort((a, b) =>
            String(a.uploadedAt || "").localeCompare(b.uploadedAt || ""),
          )[0]?.id;
      } else {
        legacyId = `u_legacy_${c.id.slice(-6)}`;
        await exec(
          `INSERT IGNORE INTO analytics_uploads
             (id, campaign_id, filename, uploaded_at, rows_read, added, duplicates, skipped, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            legacyId,
            c.id,
            "Previously uploaded data",
            toMySqlDate(c.lastUploadAt) ||
              toMySqlDate(new Date().toISOString()),
            events.length,
            events.length,
            0,
            0,
            1,
          ],
        );
      }
    }

    const BATCH = 500;
    for (let i = 0; i < events.length; i += BATCH) {
      const slice = events.slice(i, i + BATCH);
      const values = [];
      const params = [];
      for (const ev of slice) {
        const uid = ev._uploadId || legacyId;
        if (!uid) continue;
        values.push(
          "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        params.push(
          c.id,
          uid,
          str(ev.conversion_id, 128),
          str(ev.transaction_id, 128),
          str(ev.event_name, 128),
          toMySqlDate(ev.date) || toMySqlDate(ev.event_date),
          toMySqlDate(ev.click_date),
          num(ev.delta_hours),
          num(ev.revenue),
          str(ev.revenue_type, 64),
          str(ev.offer_id, 64),
          str(ev.offer_name, 255),
          str(ev.sub1, 255),
          str(ev.sub2, 255),
          str(ev.sub3, 255),
          str(ev.country_code, 8),
          str(ev.region, 128),
          str(ev.city, 128),
          str(ev.device_type, 64),
          str(ev.os_version || ev.os, 64),
          str(ev.browser, 64),
          JSON.stringify(ev),
        );
      }
      if (values.length === 0) continue;
      await exec(
        `INSERT INTO analytics_events
           (campaign_id, upload_id, conversion_id, transaction_id, event_name,
            event_date, click_date, delta_hours, revenue, revenue_type,
            offer_id, offer_name, sub1, sub2, sub3, country_code, region, city,
            device_type, os, browser, event_data)
         VALUES ${values.join(",")}`,
        params,
      );
    }
  }
}

async function migrateTrackerSettings() {
  const s = readJson(TRK_SETTINGS, null);
  if (!s) { console.log("Tracker: no settings.json"); return; }
  await exec(
    `INSERT INTO tracker_settings (id, sheet_url, updated_at)
       VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE sheet_url = VALUES(sheet_url), updated_at = VALUES(updated_at)`,
    [s.sheetUrl || null, toMySqlDate(s.updatedAt)],
  );
  console.log("Tracker: settings imported");
}

async function migrateTrackerNames() {
  const n = readJson(TRK_NAMES, null);
  if (!n) { console.log("Tracker: no names.json"); return; }

  const upserts = [];
  for (const [type, map] of [
    ["campaign", n.campaigns || {}],
    ["adset",    n.adsets    || {}],
    ["ad",       n.ads       || {}],
  ]) {
    for (const [id, name] of Object.entries(map)) {
      upserts.push([type, id, name, n.account || null, toMySqlDate(n.syncedAt)]);
    }
  }

  for (let i = 0; i < upserts.length; i += 500) {
    const slice = upserts.slice(i, i + 500);
    const ph = slice.map(() => "(?, ?, ?, ?, ?)").join(",");
    const params = slice.flat();
    await exec(
      `INSERT INTO tracker_names
         (entity_type, entity_id, name, account, synced_at)
       VALUES ${ph}
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         account = VALUES(account),
         synced_at = VALUES(synced_at)`,
      params,
    );
  }

  if (n.syncedAt) {
    await exec(
      `INSERT INTO tracker_sync_meta (id, account, synced_at)
         VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE account = VALUES(account), synced_at = VALUES(synced_at)`,
      [n.account || null, toMySqlDate(n.syncedAt)],
    );
  }
  console.log(`Tracker: ${upserts.length} names imported`);
}

try {
  await migrateAnalytics();
  await migrateTrackerSettings();
  await migrateTrackerNames();

  const [{ c }] = await query("SELECT COUNT(*) AS c FROM analytics_campaigns");
  const [{ e }] = await query("SELECT COUNT(*) AS e FROM analytics_events");
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM tracker_names");
  console.log(`\nDone — campaigns=${c} events=${e} names=${n}`);
} catch (e) {
  console.error("Migration failed:", e.message || e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
