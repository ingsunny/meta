// GET    /api/analytics/campaigns/[id] — campaign metadata + uploads + insights
// DELETE /api/analytics/campaigns/[id] — remove the campaign and its events

import { NextResponse } from "next/server";
import {
  getCampaign,
  getActiveEvents,
  deleteCampaign,
  listUploads,
} from "@/lib/analytics/storage";
import { computeInsights } from "@/lib/analytics/insights";

export async function GET(_req, { params }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }
  const events = await getActiveEvents(id);
  const insights = computeInsights(events);
  const uploads = await listUploads(id);
  return NextResponse.json({ success: true, campaign, insights, uploads });
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const result = await deleteCampaign(id);
  return NextResponse.json({ success: true, ...result });
}
