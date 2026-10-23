// POST /api/auth/login — { email, password } → sets the session cookie.

import { NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth/session";

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ success: false, error: "Enter your email and password." }, { status: 400 });
  }

  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.json({ success: false, error: "That email and password don't match." }, { status: 401 });
  }

  return startSession(NextResponse.json({ success: true }), user.id);
}
