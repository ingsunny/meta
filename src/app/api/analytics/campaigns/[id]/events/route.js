// GET /api/analytics/campaigns/[id]/events
// Returns the campaign's events (filtered through the upload-enabled gate)
// projected to the fields the Explore tab needs. Drops the verbose
// per-row stuff (user agent, hashed identifiers, etc.) so the payload
// stays manageable even on big campaigns.

import { NextResponse } from "next/server";
import { getCampaign, getActiveEvents } from "@/lib/analytics/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAN_FIELDS = [
  "conversion_id",
  "transaction_id",
  "date",
  "click_date",
  "delta_hours",
  "offer_id",
  "offer_name",
  "event_name",
  "revenue",
  "revenue_type",
  "sub1",
  "sub2",
  "sub3",
  "country",
  "country_code",
  "region",
  "city",
  "dma",
  "carrier",
  "platform",
  "os_version",
  "device_type",
  "brand",
  "browser",
  "language",
  "isp",
  "currency_id",
  "network_id",
];

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
  const lean = events.map((e) => {
    const o = {};
    for (const f of LEAN_FIELDS) o[f] = e[f] ?? "";
    return o;
  });
  return NextResponse.json({ success: true, events: lean, count: lean.length });
}
