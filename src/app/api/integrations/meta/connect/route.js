// GET /api/integrations/meta/connect — starts Facebook Login. Sets a
// short-lived `state` cookie that the callback checks (CSRF protection).

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { buildAuthUrl, oauthConfigured } from "@/lib/integrations/meta";

export async function GET(req) {
  const back = new URL("/integrations", req.url);
  if (!(await getCurrentUser())) return NextResponse.redirect(new URL("/login", req.url));
  if (!oauthConfigured()) {
    back.searchParams.set("error", "Facebook Login isn't configured yet. Add FB_APP_ID and FB_APP_SECRET, or paste an access token below.");
    return NextResponse.redirect(back);
  }

  const state = crypto.randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/meta",
    maxAge: 600,
  });
  return res;
}
