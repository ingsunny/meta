// Single-dimension insights breakdown for any campaign / ad set / ad.
// Returns the data Meta gives back for a specific `breakdowns=...` slice
// so the UI can plot it side-by-side or in a single-item view.

import { NextResponse } from "next/server";
import axios from "axios";
import { getMetaToken, metaNotConnected } from "@/lib/meta/accounts";
import { resolveRange, insightsQueryParams } from "@/lib/meta/range";

const API_VERSION = "v25.0";

// Whitelist: dim key shown in UI → actual Meta `breakdowns` parameter.
// Some are composites (Meta accepts comma-separated breakdowns).
const DIMENSIONS = {
  age: "age",
  gender: "gender",
  country: "country",
  // Meta's Insights API does not expose city-level breakdowns; `region`
  // (state / province) is the most granular geographic slice available.
  region: "region",
  // Platform alone (Facebook / Instagram / Audience Network / Messenger)
  // separated from placement so each can be reported on its own.
  platform: "publisher_platform",
  placement: "publisher_platform,platform_position",
  device: "impression_device",
  age_gender: "age,gender",
  hour: "hourly_stats_aggregated_by_advertiser_time_zone",
};

const FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "frequency",
  "actions",
  "cost_per_action_type",
].join(",");

async function fetchOne(id, dimKey, range) {
  const breakdowns = DIMENSIONS[dimKey];
  if (!breakdowns) {
    return { error: `Unknown dimension '${dimKey}'` };
  }
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${id}/insights`,
      {
        params: {
          fields: FIELDS,
          breakdowns,
          limit: 500,
          access_token: token,
          ...insightsQueryParams(range),
        },
      },
    );
    return { rows: res.data?.data || [] };
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`Breakdown Error [${dimKey}]:`, detail);
    return { error: detail };
  }
}

export async function GET(req) {
  const token = await getMetaToken();
  if (!token) return metaNotConnected();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const range = resolveRange(searchParams);

  // Multi-dimension mode: `?dimensions=age,gender,placement,...` returns
  // a map keyed by dimension. Used by the Action tab to fetch every
  // audience slice in a single round-trip.
  const dimensionsParam = searchParams.get("dimensions");
  if (dimensionsParam) {
    const keys = dimensionsParam
      .split(",")
      .map((s) => s.trim())
      .filter((k) => DIMENSIONS[k]);
    if (keys.length === 0) {
      return NextResponse.json(
        { error: "No valid dimensions provided" },
        { status: 400 },
      );
    }
    const results = await Promise.all(
      keys.map(async (k) => [k, await fetchOne(id, k, range)]),
    );
    const breakdowns = {};
    results.forEach(([k, r]) => {
      // Inline the rows array for valid dims; pass error objects through
      // so the client can decide what to render per dimension.
      breakdowns[k] = r.rows ?? { error: r.error };
    });
    return NextResponse.json({ success: true, breakdowns });
  }

  // Single-dimension mode (back-compat with BreakdownPanel).
  const dimKey = searchParams.get("dimension") || "age";
  const r = await fetchOne(id, dimKey, range);
  if (r.error) {
    return NextResponse.json(
      { error: "Failed to fetch breakdown", detail: r.error, dimension: dimKey },
      { status: 500 },
    );
  }
  return NextResponse.json({
    success: true,
    dimension: dimKey,
    rows: r.rows,
  });
}
