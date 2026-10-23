// Generates a downloadable XLSX report for a campaign. Re-uses the same
// Meta API shape that the [id] detail route fetches, plus the configured
// account metadata for currency formatting.

import { NextResponse } from "next/server";
import axios from "axios";
import { getAccounts, resolveAccountId } from "@/lib/meta/accounts";
import { buildCampaignReport, sanitizeFilename } from "@/lib/meta/report";
import { resolveRange, insightsModifier } from "@/lib/meta/range";

const FB_TOKEN = process.env.FB_TOKEN;
const API_VERSION = "v25.0";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign");
  const range = resolveRange(searchParams);
  const mod = insightsModifier(range);
  const accountId = resolveAccountId(searchParams.get("account"));

  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
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
      `insights.${mod}{${insightFields}}`,
      `adsets.limit(200){
        id,name,status,effective_status,daily_budget,lifetime_budget,
        optimization_goal,billing_event,start_time,end_time,targeting,
        insights.${mod}{${insightFields}},
        ads.limit(200){
          id,name,status,effective_status,
          creative{id,name,thumbnail_url},
          insights.${mod}{${insightFields}}
        }
      }`,
    ].join(",");

    const [campaignRes, accounts] = await Promise.all([
      axios.get(`https://graph.facebook.com/${API_VERSION}/${campaignId}`, {
        params: { fields, access_token: FB_TOKEN },
      }),
      getAccounts(),
    ]);

    const campaign = campaignRes.data;
    const account =
      accounts.find((a) => a.id === accountId) || accounts[0] || null;

    const workbook = await buildCampaignReport({ campaign, account, range });
    const buffer = await workbook.xlsx.writeBuffer();

    const safe = sanitizeFilename(campaign.name);
    const date = new Date().toISOString().slice(0, 10);
    const rangeSlug =
      range.kind === "custom" ? `${range.since}_to_${range.until}` : range.preset;
    const filename = `${safe}-${rangeSlug}-${date}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error("Report Error:", detail);
    return NextResponse.json(
      { error: "Failed to build report", detail },
      { status: 500 },
    );
  }
}
