#!/usr/bin/env node
// Creates every table in src/lib/schema.sql, then applies the small column
// migrations older databases need. Idempotent — re-running is a no-op.
//
// Usage: npm run db:init

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Same env files Next.js reads, .env.local winning.
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const SCHEMA = fs.readFileSync(path.join(ROOT, "src", "lib", "schema.sql"), "utf8");

// [table, column, definition] — added when missing (MySQL has no
// ADD COLUMN IF NOT EXISTS).
const COLUMN_MIGRATIONS = [
  ["analytics_campaigns", "user_id", "VARCHAR(32) NULL AFTER id, ADD KEY idx_campaign_user (user_id)"],
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "toosio",
  waitForConnections: true,
  multipleStatements: true,
  charset: "utf8mb4",
});

try {
  process.stdout.write("Creating tables… ");
  const conn = await pool.getConnection();
  try {
    await conn.query(SCHEMA);
    process.stdout.write("ok\n");

    for (const [table, column, def] of COLUMN_MIGRATIONS) {
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
      );
      if (rows.length === 0) {
        process.stdout.write(`Adding ${table}.${column}… `);
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
        process.stdout.write("ok\n");
      }
    }
  } finally {
    conn.release();
  }
} catch (e) {
  console.error("DB init failed:", e.message || e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
