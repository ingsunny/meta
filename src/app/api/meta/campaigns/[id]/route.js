import { NextResponse } from "next/server";
import axios from "axios";
import { resolveRange, insightsModifier } from "@/lib/meta/range";

const FB_TOKEN = process.env.FB_TOKEN;
const API_VERSION = "v25.0";

export async function GET(req, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const range = resolveRange(searchParams);
  const mod = insightsModifier(range);

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

    const adInsightFields = [
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

    const fields = [
      "id",
      "name",
      "status",
      "effective_status",
      "objective",
      "created_time",
      "daily_budget",
      "lifetime_budget",
      "budget_remaining",
      "account_id",
      `insights.${mod}{${insightFields}}`,
      `adsets.limit(200){
        id,
        name,
        status,
        effective_status,
        daily_budget,
        lifetime_budget,
        optimization_goal,
        billing_event,
        start_time,
        end_time,
        targeting,
        targeting_optimization_types,
        insights.${mod}{${adInsightFields}},
        ads.limit(200){
          id,
          name,
          status,
          effective_status,
          creative{id,name,thumbnail_url,object_type,effective_object_story_id},
          insights.${mod}{${adInsightFields}}
        }
      }`,
    ].join(",");

    const res = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${id}`,
      { params: { fields, access_token: FB_TOKEN } },
    );

    return NextResponse.json({ success: true, range, data: res.data });
  } catch (error) {
    console.error("Meta API Error:", error.response?.data || error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch campaign details",
        detail: error.response?.data,
      },
      { status: 500 },
    );
  }
}
