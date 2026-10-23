// GET /api/journey/by-ip/[ip]
// Returns the full user journey for a session_ip: every fuse click,
// every conv-report event, and a unified chronological timeline.

import { NextResponse } from "next/server";
import { getJourneyByIp } from "@/lib/journey/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { ip } = await params;
  const decoded = decodeURIComponent(ip || "");
  const journey = await getJourneyByIp(decoded);
  if (!journey) {
    return NextResponse.json(
      { success: false, error: "No journey found for that IP" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, ...journey });
}
