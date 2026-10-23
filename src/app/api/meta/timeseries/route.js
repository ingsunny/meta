// Daily time-series insights for any campaign / ad set / ad. Powers the
// Trends tab in the detail drawer. Returns one row per day with raw
// fields; the client computes deltas, rolling baselines, and anomalies.

import { NextResponse } from "next/server";
import axios from "axios";
import { resolveRange, insightsQueryParams } from "@/lib/meta/range";

const FB_TOKEN = process.env.FB_TOKEN;
const API_VERSION = "v25.0";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const range = resolveRange(searchParams);

  // Time-series only makes sense on finite ranges. If the user is on
  // "Lifetime" with a multi-year history, we cap the series at last 90 days
  // so the chart stays readable and the API call stays fast.
  let qsRange = range;
  if (range.kind === "preset" && range.preset === "maximum") {
    qsRange = { kind: "preset", preset: "last_90d" };
  }

  try {
    const fields = [
      "spend",
      "impressions",
      "clicks",
      "reach",
      "ctr",
      "cpc",
      "cpm",
      "frequency",
      "actions",
      "cost_per_action_type",
      "date_start",
      "date_stop",
    ].join(",");

    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${id}/insights`,
      {
        params: {
          fields,
          time_increment: 1,
          limit: 500,
          access_token: FB_TOKEN,
          ...insightsQueryParams(qsRange),
        },
      },
    );

    return NextResponse.json({
      success: true,
      id,
      effectiveRange: qsRange,
      rows: res.data?.data || [],
    });
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error("Timeseries Error:", detail);
    return NextResponse.json(
      { error: "Failed to fetch time-series", detail },
      { status: 500 },
    );
  }
}
