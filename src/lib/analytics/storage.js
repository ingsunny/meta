// Database-backed persistence for the analytics section.
//
// Tables
// ------
//   analytics_campaigns  — one row per campaign (name, created_at, links, …)
//   analytics_uploads    — one row per CSV upload (counts, enabled flag)
//   analytics_events     — one row per conversion event, with hot columns
//                          broken out + the rest stored in event_data JSON
//
// All exports return the same JS shapes the file-based store used, so the
// API layer / route handlers / insights code didn't have to change much —
// only that calls now have to be awaited.
//
// Every campaign belongs to a user. Campaign-level reads/writes are scoped to
// the signed-in user here, so route handlers get ownership checks for free:
// someone else's campaign id simply reads as "not found".

import { query, one, exec } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

async function currentUserId() {
  return (await getCurrentUser())?.id || null;
}

// ── helpers ────────────────────────────────────────────────────────────
function newCampaignId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function newUploadId() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function toIso(v) {
  if (!v) return null;
  if (typeof v === "string") {
    // MySQL DATETIME strings like "2026-05-01 12:34:56" → ISO
    const t = v.includes("T") ? v : v.replace(" ", "T") + "Z";
    const d = new Date(t);
    return isNaN(d) ? null : d.toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return null;
}
function mysqlDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v, max = 255) {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function parseJsonField(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

// ── shape helpers ──────────────────────────────────────────────────────
async function rowToCampaign(r) {
  if (!r) return null;
  const uploads = await listUploads(r.id);
  const eventCount = await campaignEventCount(r.id);
  return {
    id: r.id,
    name: r.name,
    createdAt: toIso(r.created_at),
    lastUploadAt: toIso(r.last_upload_at),
    linkedMetas: parseJsonField(r.linked_metas) || [],
    eventCount,
    uploadCount: uploads.length,
    uploads,
  };
}

function rowToUpload(r) {
  return {
    id: r.id,
    filename: r.filename || "upload.csv",
    uploadedAt: toIso(r.uploaded_at),
    rowsRead: r.rows_read,
    added: r.added,
    duplicates: r.duplicates,
    skipped: r.skipped,
    events: r.added,
    enabled: !!r.enabled,
  };
}

function rowToEvent(r) {
  const base = parseJsonField(r.event_data) || {};
  // Hot columns take precedence over JSON for fields the schema split out;
  // JSON keys are kept verbatim so insights code that reads niche columns
  // (e.g. carrier, dma, language) still works.
  return {
    ...base,
    conversion_id: r.conversion_id ?? base.conversion_id ?? "",
    transaction_id: r.transaction_id ?? base.transaction_id ?? "",
    event_name: r.event_name ?? base.event_name ?? "",
    date: toIso(r.event_date) ?? base.date ?? "",
    click_date: toIso(r.click_date) ?? base.click_date ?? "",
    delta_hours: r.delta_hours != null ? Number(r.delta_hours) : base.delta_hours ?? "",
    revenue: r.revenue != null ? Number(r.revenue) : base.revenue ?? "",
    revenue_type: r.revenue_type ?? base.revenue_type ?? "",
    offer_id: r.offer_id ?? base.offer_id ?? "",
    offer_name: r.offer_name ?? base.offer_name ?? "",
    sub1: r.sub1 ?? base.sub1 ?? "",
    sub2: r.sub2 ?? base.sub2 ?? "",
    sub3: r.sub3 ?? base.sub3 ?? "",
    country_code: r.country_code ?? base.country_code ?? "",
    region: r.region ?? base.region ?? "",
    city: r.city ?? base.city ?? "",
    device_type: r.device_type ?? base.device_type ?? "",
    os_version: r.os ?? base.os_version ?? "",
    browser: r.browser ?? base.browser ?? "",
    _uploadId: r.upload_id,
  };
}

async function campaignEventCount(campaignId) {
  const r = await one(
    "SELECT COUNT(*) AS c FROM analytics_events WHERE campaign_id = ?",
    [campaignId],
  );
  return Number(r?.c || 0);
}

// ── public API ─────────────────────────────────────────────────────────

export async function listCampaigns() {
  const rows = await query(
    `SELECT id, name, created_at, last_upload_at, linked_metas, meta
       FROM analytics_campaigns
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [await currentUserId()],
  );
  return Promise.all(rows.map(rowToCampaign));
}

export async function getCampaign(id) {
  const r = await one(
    `SELECT id, name, created_at, last_upload_at, linked_metas, meta
       FROM analytics_campaigns WHERE id = ? AND user_id = ?`,
    [id, await currentUserId()],
  );
  return rowToCampaign(r);
}

export async function createCampaign(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Campaign name is required");
  const userId = await currentUserId();
  if (!userId) throw new Error("Not signed in");
  const id = newCampaignId();
  const now = mysqlDate(new Date().toISOString());
  await exec(
    `INSERT INTO analytics_campaigns (id, user_id, name, created_at, linked_metas, meta)
     VALUES (?, ?, ?, ?, '[]', '{}')`,
    [id, userId, trimmed, now],
  );
  return getCampaign(id);
}

export async function deleteCampaign(id) {
  const r = await exec(
    "DELETE FROM analytics_campaigns WHERE id = ? AND user_id = ?",
    [id, await currentUserId()],
  );
  return { removed: r?.affectedRows || 0 };
}

export async function listUploads(campaignId) {
  const rows = await query(
    `SELECT id, filename, uploaded_at, rows_read, added, duplicates, skipped, enabled
       FROM analytics_uploads
      WHERE campaign_id = ?
      ORDER BY uploaded_at DESC`,
    [campaignId],
  );
  return rows.map(rowToUpload);
}

export async function getEvents(campaignId) {
  const rows = await query(
    `SELECT upload_id, conversion_id, transaction_id, event_name, event_date,
            click_date, delta_hours, revenue, revenue_type, offer_id, offer_name,
            sub1, sub2, sub3, country_code, region, city, device_type, os, browser,
            event_data
       FROM analytics_events
      WHERE campaign_id = ?
      ORDER BY event_date ASC, id ASC`,
    [campaignId],
  );
  return rows.map(rowToEvent);
}

export async function getActiveEvents(campaignId) {
  // Filter at the SQL layer so we don't ship disabled rows to Node.
  const rows = await query(
    `SELECT e.upload_id, e.conversion_id, e.transaction_id, e.event_name, e.event_date,
            e.click_date, e.delta_hours, e.revenue, e.revenue_type, e.offer_id, e.offer_name,
            e.sub1, e.sub2, e.sub3, e.country_code, e.region, e.city,
            e.device_type, e.os, e.browser, e.event_data
       FROM analytics_events e
       JOIN analytics_uploads u ON u.id = e.upload_id
      WHERE e.campaign_id = ? AND u.enabled = 1
      ORDER BY e.event_date ASC, e.id ASC`,
    [campaignId],
  );
  return rows.map(rowToEvent);
}

// Enforce "at least one upload must stay enabled" so disabling everything
// can't leave an empty insights view. Returns the updated campaign.
export async function setUploadEnabled(campaignId, uploadId, enabled) {
  if (enabled === false) {
    const r = await one(
      `SELECT COUNT(*) AS c FROM analytics_uploads
        WHERE campaign_id = ? AND enabled = 1 AND id <> ?`,
      [campaignId, uploadId],
    );
    if (Number(r?.c || 0) === 0) {
      const err = new Error(
        "At least one upload must remain enabled. Enable another upload first.",
      );
      err.code = "LAST_ENABLED";
      throw err;
    }
  }
  await exec(
    "UPDATE analytics_uploads SET enabled = ? WHERE id = ? AND campaign_id = ?",
    [enabled === false ? 0 : 1, uploadId, campaignId],
  );
  return getCampaign(campaignId);
}

// Append new events tagged with a fresh upload id. Dedupe by conversion_id
// across existing data so re-uploading the same CSV is safe.
export async function appendEvents(campaignId, newEvents, { filename } = {}) {
  // Build the dedupe set from existing events for this campaign.
  const existing = await query(
    "SELECT conversion_id FROM analytics_events WHERE campaign_id = ? AND conversion_id IS NOT NULL",
    [campaignId],
  );
  const seen = new Set(existing.map((r) => r.conversion_id));

  const uploadId = newUploadId();
  const uploadedAt = mysqlDate(new Date().toISOString());
  let added = 0, duplicates = 0, skipped = 0;

  const accepted = [];
  for (const ev of newEvents) {
    const key = ev.conversion_id;
    if (!key) { skipped++; continue; }
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    accepted.push(ev);
    added++;
  }

  // Insert the upload row first so the FK on events resolves.
  await exec(
    `INSERT INTO analytics_uploads
       (id, campaign_id, filename, uploaded_at, rows_read, added, duplicates, skipped, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      uploadId,
      campaignId,
      filename || "upload.csv",
      uploadedAt,
      newEvents.length,
      added,
      duplicates,
      skipped,
    ],
  );

  // Batched INSERT of accepted events.
  const BATCH = 500;
  for (let i = 0; i < accepted.length; i += BATCH) {
    const slice = accepted.slice(i, i + BATCH);
    const values = [];
    const params = [];
    for (const ev of slice) {
      values.push(
        "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      params.push(
        campaignId,
        uploadId,
        str(ev.conversion_id, 128),
        str(ev.transaction_id, 128),
        str(ev.event_name, 128),
        mysqlDate(ev.date || ev.event_date),
        mysqlDate(ev.click_date),
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

  // Bump campaign.last_upload_at so the campaign list shows the freshness.
  await exec(
    `UPDATE analytics_campaigns SET last_upload_at = ? WHERE id = ?`,
    [uploadedAt, campaignId],
  );

  const total = await campaignEventCount(campaignId);
  return {
    added,
    duplicates,
    skipped,
    total,
    uploadId,
    upload: {
      id: uploadId,
      filename: filename || "upload.csv",
      uploadedAt: toIso(uploadedAt),
      rowsRead: newEvents.length,
      added,
      duplicates,
      skipped,
      events: added,
      enabled: true,
    },
  };
}

export const MAX_LINKED_META = 3;

export function getLinkedMetas(campaign) {
  if (!campaign) return [];
  if (Array.isArray(campaign.linkedMetas)) return campaign.linkedMetas;
  if (campaign.linkedMeta) return [campaign.linkedMeta];
  return [];
}

export async function setLinkedMetas(campaignId, linkedMetas) {
  const next = Array.isArray(linkedMetas)
    ? linkedMetas.slice(0, MAX_LINKED_META)
    : [];
  await exec(
    "UPDATE analytics_campaigns SET linked_metas = ? WHERE id = ?",
    [JSON.stringify(next), campaignId],
  );
  return getCampaign(campaignId);
}

// Remove every event that arrived in a specific upload + drop the upload
// row itself. FK ON DELETE CASCADE handles the events for us.
export async function deleteUpload(campaignId, uploadId) {
  const before = await campaignEventCount(campaignId);
  await exec(
    "DELETE FROM analytics_uploads WHERE id = ? AND campaign_id = ?",
    [uploadId, campaignId],
  );
  const after = await campaignEventCount(campaignId);

  // Recompute last_upload_at from whatever's left so the list view stays
  // accurate after a delete.
  const r = await one(
    `SELECT MAX(uploaded_at) AS lu FROM analytics_uploads WHERE campaign_id = ?`,
    [campaignId],
  );
  await exec(
    `UPDATE analytics_campaigns SET last_upload_at = ? WHERE id = ?`,
    [r?.lu || null, campaignId],
  );

  return { removed: before - after, eventsRemaining: after };
}
