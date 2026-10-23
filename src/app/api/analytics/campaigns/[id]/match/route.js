// GET /api/analytics/campaigns/[id]/match
// Returns the full paired analysis (Meta totals + analytics insights +
// derived metrics + daily overlay) for the linked Meta campaign. If no
// link is set, returns { linked: false } so the UI can show the picker.

import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/analytics/storage";
import { buildMatch } from "@/lib/analytics/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }
  try {
    const match = await buildMatch({ analyticsCampaign: campaign });
    return NextResponse.json({ success: true, ...match });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || "Match build failed" },
      { status: 500 },
    );
  }
}
