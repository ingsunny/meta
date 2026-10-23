#!/usr/bin/env node
// Creates every table in src/lib/schema.sql.
// Idempotent — re-running on an existing DB is a no-op.
//
// Usage: npm run db:init

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(
  path.join(__dirname, "..", "src", "lib", "schema.sql"),
  "utf8",
);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "meta-ads",
  waitForConnections: true,
  multipleStatements: true,
  charset: "utf8mb4",
});

try {
  process.stdout.write("Creating tables… ");
  const conn = await pool.getConnection();
  try {
    await conn.query(SCHEMA);
  } finally {
    conn.release();
  }
  process.stdout.write("ok\n");
} catch (e) {
  console.error("DB init failed:", e.message || e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
