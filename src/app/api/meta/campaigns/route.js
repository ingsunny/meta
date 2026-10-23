import { NextResponse } from "next/server";
import axios from "axios";
import { resolveAccountId } from "@/lib/meta/accounts";
import { resolveRange, insightsModifier } from "@/lib/meta/range";

const FB_TOKEN = process.env.FB_TOKEN;
const API_VERSION = "v25.0";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const range = resolveRange(searchParams);
  const accountId = resolveAccountId(searchParams.get("account"));

  if (!accountId) {
    return NextResponse.json(
      { error: "No ad account configured. Set AD_ACCOUNT_ID in .env.local." },
      { status: 500 },
    );
  }

  try {
    const insightFields = [
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
      "unique_clicks",
      "unique_ctr",
      "date_start",
      "date_stop",
    ].join(",");

    const campaignFields = [
      "id",
      "name",
      "status",
      "effective_status",
      "objective",
      "created_time",
      "daily_budget",
      "lifetime_budget",
      "budget_remaining",
      `insights.${insightsModifier(range)}{${insightFields}}`,
    ].join(",");

    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${accountId}/campaigns`,
      {
        params: {
          fields: campaignFields,
          access_token: FB_TOKEN,
          limit: 100,
        },
      },
    );

    return NextResponse.json({
      success: true,
      range,
      account: accountId,
      campaigns: res.data.data,
    });
  } catch (error) {
    console.error("Meta Fetch Error:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 },
    );
  }
}
