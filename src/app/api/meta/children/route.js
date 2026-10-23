// Fetches every ad under a given node (campaign or ad set) with insights.
// Used by the Scale tab to answer "which AD got the most leads" — Meta
// doesn't expose an `ad_id` breakdown via the Insights API, so we list the
// descendants and rank them client-side.

import { NextResponse } from "next/server";
import axios from "axios";
import { getMetaToken, metaNotConnected } from "@/lib/meta/accounts";
import { resolveRange, insightsModifier } from "@/lib/meta/range";

const API_VERSION = "v25.0";

export async function GET(req) {
  const token = await getMetaToken();
  if (!token) return metaNotConnected();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const range = resolveRange(searchParams);
  const insightsMod = insightsModifier(range);

  try {
    const fields = [
      "id",
      "name",
      "status",
      "effective_status",
      "created_time",
      "creative{thumbnail_url}",
      `insights.${insightsMod}{spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type}`,
    ].join(",");

    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${id}/ads`,
      {
        params: {
          fields,
          limit: 200,
          access_token: token,
        },
      },
    );

    return NextResponse.json({
      success: true,
      ads: res.data?.data || [],
    });
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error("Children Error:", detail);
    return NextResponse.json(
      { error: "Failed to fetch children", detail },
      { status: 500 },
    );
  }
}
