// Reports persistence. Every query is scoped to the owning user.

import { query, one, exec, getPool } from "@/lib/db";
import { newId, toSqlDate } from "@/lib/auth/crypto";

const BATCH = 500;

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function toReport(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    filename: r.filename,
    source: r.source,
    columns: parseJson(r.columns_json, []),
    rowCount: r.row_count,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    summary: parseJson(r.summary_json, {}),
    createdAt: r.created_at,
  };
}

export async function createReport(userId, { name, filename, columns, rows, summary }) {
  const id = newId();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO reports
         (id, user_id, name, filename, source, columns_json, row_count, date_from, date_to, summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        name.slice(0, 255),
        filename?.slice(0, 512) || null,
        summary.source,
        JSON.stringify(columns),
        rows.length,
        summary.dateFrom,
        summary.dateTo,
        JSON.stringify(summary),
        toSqlDate(),
      ],
    );
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const placeholders = chunk.map(() => "(?, ?, ?)").join(",");
      const params = chunk.flatMap((r, j) => [id, i + j, JSON.stringify(r)]);
      await conn.query(`INSERT INTO report_rows (report_id, idx, data) VALUES ${placeholders}`, params);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return id;
}

export async function listReports(userId, { limit = 100 } = {}) {
  const rows = await query(
    `SELECT id, name, filename, source, columns_json, row_count, date_from, date_to, summary_json, created_at
       FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ${Number(limit) | 0}`,
    [userId],
  );
  return rows.map(toReport);
}

export async function countReports(userId) {
  const r = await one(`SELECT COUNT(*) AS c FROM reports WHERE user_id = ?`, [userId]);
  return Number(r?.c || 0);
}

export async function getReport(userId, id) {
  return toReport(await one(`SELECT * FROM reports WHERE id = ? AND user_id = ?`, [id, userId]));
}

export async function getReportRows(reportId) {
  const rows = await query(`SELECT data FROM report_rows WHERE report_id = ? ORDER BY idx`, [reportId]);
  return rows.map((r) => parseJson(r.data, []));
}

export async function renameReport(userId, id, name) {
  const r = await exec(`UPDATE reports SET name = ? WHERE id = ? AND user_id = ?`, [name.slice(0, 255), id, userId]);
  return r.affectedRows > 0;
}

export async function deleteReport(userId, id) {
  const r = await exec(`DELETE FROM reports WHERE id = ? AND user_id = ?`, [id, userId]);
  return r.affectedRows > 0;
}
