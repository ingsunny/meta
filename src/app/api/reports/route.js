// GET /api/reports — the signed-in user's reports (no rows).

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { listReports } from "@/lib/reports/storage";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ success: true, reports: await listReports(user.id) });
}
