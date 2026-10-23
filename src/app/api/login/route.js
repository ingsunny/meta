// POST /api/login — accepts { password } and, on match, sets the auth cookie
// the middleware reads. Hardcoded passcode by design: this is a simple
// deterrent, not real authentication.

import { NextResponse } from "next/server";

const PASSCODE = "Loginamd@321";
const AUTH_COOKIE = "fb_ads_auth";
const AUTH_VALUE = "unlocked-v1";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const password = typeof body?.password === "string" ? body.password : "";

  if (password !== PASSCODE) {
    return NextResponse.json(
      { success: false, error: "Wrong passcode" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, AUTH_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
