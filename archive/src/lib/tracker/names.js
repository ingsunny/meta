// DB-backed Meta entity name lookup.
//
// Tables:
//   tracker_names      — (entity_type, entity_id) → name, account, synced_at
//   tracker_sync_meta  — global last-sync row so the UI can show "synced 4h ago"
//
// readNames() is a single round-trip that pivots the table back into the
// {campaigns, adsets, ads} object the dashboard already expects.

import { one, query, getPool } from "@/lib/db";

const EMPTY = {
  syncedAt: null,
  account: null,
  campaigns: {},
  adsets: {},
  ads: {},
};

function toIso(v) {
  if (!v) return null;
  if (typeof v === "string") {
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

export async function readNames() {
  const meta = await one(
    "SELECT account, synced_at FROM tracker_sync_meta WHERE id = 1",
  );
  const rows = await query(
    "SELECT entity_type, entity_id, name FROM tracker_names",
  );
  const out = { ...EMPTY, syncedAt: toIso(meta?.synced_at), account: meta?.account || null };
  for (const r of rows) {
    const bucket =
      r.entity_type === "campaign" ? "campaigns"
        : r.entity_type === "adset" ? "adsets"
        : r.entity_type === "ad" ? "ads"
        : null;
    if (bucket) out[bucket][String(r.entity_id)] = r.name || "";
  }
  return out;
}

// Replace the entire lookup in one transaction so partial syncs never leave
// stale rows behind. Called from POST /api/tracker/names after a fresh pull
// from the Meta Graph API.
export async function writeNames(data) {
  const syncedAt = mysqlDate(data?.syncedAt || new Date().toISOString());
  const account = data?.account || null;

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM tracker_names");

    const buckets = [
      ["campaign", data?.campaigns || {}],
      ["adset",    data?.adsets    || {}],
      ["ad",       data?.ads       || {}],
    ];
    for (const [type, map] of buckets) {
      const entries = Object.entries(map);
      for (let i = 0; i < entries.length; i += 500) {
        const slice = entries.slice(i, i + 500);
        const ph = slice.map(() => "(?, ?, ?, ?, ?)").join(",");
        const params = [];
        for (const [id, name] of slice) {
          params.push(type, String(id), name || "", account, syncedAt);
        }
        await conn.query(
          `INSERT INTO tracker_names
             (entity_type, entity_id, name, account, synced_at)
           VALUES ${ph}`,
          params,
        );
      }
    }

    await conn.query(
      `INSERT INTO tracker_sync_meta (id, account, synced_at)
         VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE account = VALUES(account), synced_at = VALUES(synced_at)`,
      [account, syncedAt],
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return { ...data, syncedAt: toIso(syncedAt), account };
}
