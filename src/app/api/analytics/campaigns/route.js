// GET  /api/analytics/campaigns  — list all analytics campaigns
// POST /api/analytics/campaigns  — create a new campaign by name

import { NextResponse } from "next/server";
import { listCampaigns, createCampaign } from "@/lib/analytics/storage";

export async function GET() {
  const campaigns = await listCampaigns();
  return NextResponse.json({ success: true, campaigns });
}

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

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { success: false, error: "Campaign name is required" },
      { status: 400 },
    );
  }

  try {
    const campaign = await createCampaign(name);
    return NextResponse.json({ success: true, campaign });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message || "Failed to create campaign" },
      { status: 500 },
    );
  }
}
