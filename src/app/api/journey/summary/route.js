// GET /api/journey/summary — KPI cards + daily series + top breakdowns
// + facet values for the filter chips.

import { NextResponse } from "next/server";
import { getSummary, getFacetValues } from "@/lib/journey/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [summary, facets] = await Promise.all([getSummary(), getFacetValues()]);
  return NextResponse.json({ success: true, ...summary, facets });
}
