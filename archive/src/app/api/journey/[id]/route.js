// GET /api/journey/[id] — full timeline for one click (id from journey_clicks).
// Returns the click record, its matching conversions, and a unified
// chronological timeline the drawer renders as a step ladder.

import { NextResponse } from "next/server";
import { getJourney } from "@/lib/journey/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const journey = await getJourney(Number(id));
  if (!journey) {
    return NextResponse.json(
      { success: false, error: "Journey not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, ...journey });
}
