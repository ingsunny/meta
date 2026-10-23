// POST /api/auth/logout — deletes the session row and clears the cookie.

import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export async function POST() {
  return endSession(NextResponse.json({ success: true }));
}
