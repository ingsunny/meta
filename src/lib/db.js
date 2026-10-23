// MySQL connection pool — shared across every route handler that hits the
// database. Reads credentials from env, defaults match a vanilla XAMPP /
// phpMyAdmin install (localhost:3306, root, empty password) so a fresh
// developer machine works without extra config.
//
// Env vars:
//   DB_HOST       default: 127.0.0.1
//   DB_PORT       default: 3306
//   DB_USER       default: root
//   DB_PASSWORD   default: ""
//   DB_NAME       default: meta-ads
//   DB_CONN_LIMIT default: 10
//
// Usage:
//   import { query, one, exec, getPool } from "@/lib/db";
//   const rows = await query("SELECT * FROM analytics_campaigns");
//   const c    = await one("SELECT * FROM analytics_campaigns WHERE id = ?", [id]);
//   await exec("INSERT INTO foo (a, b) VALUES (?, ?)", [1, 2]);

import mysql from "mysql2/promise";

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  waitForConnections: true,
  multipleStatements: true,
  // Long strings (JSON cols, large rows) — make sure we don't truncate
  // and we always return JS-friendly types.
  dateStrings: true,
  charset: "utf8mb4",
};

let pool = null;

export function getPool() {
  if (!pool) pool = mysql.createPool(config);
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function exec(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

// Run a string of raw SQL (semicolon-separated). Used by db-init. Pool's
// `query` (not `execute`) supports multiple statements when the option is on.
export async function rawExec(sql) {
  const conn = await getPool().getConnection();
  try {
    await conn.query(sql);
  } finally {
    conn.release();
  }
}
