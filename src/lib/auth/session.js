// Server-only session layer. The cookie holds a random token; the DB holds
// its SHA-256. `getCurrentUser()` is memoized per request with React cache,
// so layouts, pages and route handlers can all call it freely.

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { query, one, exec } from "@/lib/db";
import { newId, sha256, hashPassword, verifyPassword, toSqlDate } from "./crypto";

export const SESSION_COOKIE = "toosio_session";
const SESSION_DAYS = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validateSignup({ name, email, password }) {
  if (!String(name || "").trim()) return "Tell us your name.";
  if (!EMAIL_RE.test(normalizeEmail(email))) return "Enter a valid email address.";
  if (String(password || "").length < 8) return "Password must be at least 8 characters.";
  return null;
}

export async function createUser({ name, email, password }) {
  const id = newId();
  await exec(
    `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, normalizeEmail(email), String(name).trim().slice(0, 120), await hashPassword(password), toSqlDate()],
  );
  return { id, email: normalizeEmail(email), name: String(name).trim() };
}

export async function findUserByEmail(email) {
  return one(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)]);
}

export async function authenticate(email, password) {
  const user = await findUserByEmail(email);
  // Still run a hash on unknown emails so timing doesn't reveal which exist.
  if (!user) {
    await hashPassword(password || "x");
    return null;
  }
  return (await verifyPassword(password, user.password_hash)) ? user : null;
}

// Creates a session row and sets the cookie on the given response.
export async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  const h = await headers();
  await exec(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sha256(token),
      userId,
      toSqlDate(),
      toSqlDate(expires),
      (h.get("user-agent") || "").slice(0, 512),
      (h.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null,
    ],
  );
  await exec(`UPDATE users SET last_login_at = ? WHERE id = ?`, [toSqlDate(), userId]);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return res;
}

export async function endSession(res) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await exec(`DELETE FROM sessions WHERE id = ?`, [sha256(token)]);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await one(
    `SELECT u.id, u.email, u.name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP()`,
    [sha256(token)],
  );
  return row || null;
});

// For server components / layouts: bounce to /login when signed out.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function unauthorized() {
  return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
}

export async function changePassword(userId, current, next) {
  const user = await one(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
  if (!user || !(await verifyPassword(current, user.password_hash))) return "Current password is incorrect.";
  if (String(next || "").length < 8) return "New password must be at least 8 characters.";
  await exec(`UPDATE users SET password_hash = ? WHERE id = ?`, [await hashPassword(next), userId]);
  return null;
}

export async function updateProfile(userId, { name }) {
  const clean = String(name || "").trim().slice(0, 120);
  if (!clean) return "Name can't be empty.";
  await exec(`UPDATE users SET name = ? WHERE id = ?`, [clean, userId]);
  return null;
}

export async function purgeExpiredSessions() {
  await query(`DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()`);
}
