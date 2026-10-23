// DB-backed tracker settings (single row in tracker_settings, id = 1).
// Written only when the user clicks Save in the Tracker → Settings card.

import { one, exec } from "@/lib/db";

const EMPTY = { sheetUrl: "", updatedAt: null };

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

export async function readSettings() {
  const r = await one(
    "SELECT sheet_url, updated_at FROM tracker_settings WHERE id = 1",
  );
  if (!r) return { ...EMPTY };
  return {
    sheetUrl: r.sheet_url || "",
    updatedAt: toIso(r.updated_at),
  };
}

export async function writeSettings(data) {
  const sheetUrl = data?.sheetUrl || "";
  const updatedAt = mysqlDate(data?.updatedAt || new Date().toISOString());
  await exec(
    `INSERT INTO tracker_settings (id, sheet_url, updated_at)
       VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE sheet_url = VALUES(sheet_url), updated_at = VALUES(updated_at)`,
    [sheetUrl, updatedAt],
  );
  return { sheetUrl, updatedAt: toIso(updatedAt) };
}
