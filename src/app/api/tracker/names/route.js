// GET  /api/tracker/names      → returns the saved id→name lookup.
// POST /api/tracker/names      → re-syncs from Meta: walks the ad account's
//                                campaigns / adsets / ads (id + name only,
//                                paginated) and writes the result to the
//                                tracker_names table so subsequent loads
//                                can resolve utm_campaign / utm_term /
//                                utm_content IDs to human-readable labels.

import { NextResponse } from "next/server";
import axios from "axios";
import { resolveAccountId } from "@/lib/meta/accounts";
import { readNames, writeNames } from "@/lib/tracker/names";

const API_VERSION = "v25.0";
const PAGE_LIMIT = 500;
const MAX_PAGES = 40; // safety cap (20k entities per level)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchAllPages(url, params) {
  const out = [];
  let next = url;
  let nextParams = { ...params };
  let pages = 0;
  while (next && pages < MAX_PAGES) {
    const r = await axios.get(next, { params: nextParams });
    const data = r.data?.data || [];
    out.push(...data);
    const nextUrl = r.data?.paging?.next || null;
    if (!nextUrl) break;
    // Meta's paging.next is a fully-formed URL with all params baked in.
    next = nextUrl;
    nextParams = undefined;
    pages += 1;
  }
  return out;
}

export async function GET() {
  const data = await readNames();
  return NextResponse.json({ success: true, ...data });
}

export async function POST(req) {
  const token = process.env.FB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "FB_TOKEN not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const accountId = resolveAccountId(searchParams.get("account"));
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: "No ad account configured" },
      { status: 500 },
    );
  }

  try {
    const baseParams = {
      fields: "id,name",
      limit: PAGE_LIMIT,
      access_token: token,
    };
    const [campaigns, adsets, ads] = await Promise.all([
      fetchAllPages(
        `https://graph.facebook.com/${API_VERSION}/${accountId}/campaigns`,
        baseParams,
      ),
      fetchAllPages(
        `https://graph.facebook.com/${API_VERSION}/${accountId}/adsets`,
        baseParams,
      ),
      fetchAllPages(
        `https://graph.facebook.com/${API_VERSION}/${accountId}/ads`,
        baseParams,
      ),
    ]);

    const toMap = (list) => {
      const m = {};
      for (const e of list) if (e?.id) m[String(e.id)] = e.name || "";
      return m;
    };

    const result = {
      syncedAt: new Date().toISOString(),
      account: accountId,
      campaigns: toMap(campaigns),
      adsets: toMap(adsets),
      ads: toMap(ads),
    };
    await writeNames(result);

    return NextResponse.json({
      success: true,
      ...result,
      counts: {
        campaigns: campaigns.length,
        adsets: adsets.length,
        ads: ads.length,
      },
    });
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message || String(e);
    return NextResponse.json(
      { success: false, error: detail },
      { status: 502 },
    );
  }
}
