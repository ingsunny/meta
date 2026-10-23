// Pairs a analytics-campaign's conversion data with up to 3 Meta Ads
// campaigns. For each linked campaign we pull Meta totals + daily series
// for the analytics date range, convert spend to USD (so it matches the
// analytics revenue), then expose three views:
//   • perCampaign: individual paired numbers + per-campaign ROAS/CPA
//   • combined:    aggregate Meta spend / clicks / impressions in USD
//   • daily:       per-date overlay with one row per linked Meta campaign

import axios from "axios";
import { getActiveEvents, getLinkedMetas } from "./storage";
import { computeInsights } from "./insights";
import { getAccounts } from "../meta/accounts";

const API_VERSION = "v25.0";
const DEFAULT_INR_PER_USD = 83;

function toNumber(v) {
  if (v == null || v === "") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function analyticsRange(events) {
  let first = null;
  let last = null;
  for (const e of events) {
    const d = (e.date || "").slice(0, 10);
    if (!d) continue;
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  const today = new Date().toISOString().slice(0, 10);
  return { since: first || today, until: last || today };
}

function pickAction(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const row = actions.find((a) => a.action_type === type);
  return row ? toNumber(row.value) : 0;
}

// Aggregate analytics activity per day for the daily overlay.
function analyticsDaily(events) {
  const byDate = new Map();
  for (const e of events) {
    const d = (e.date || "").slice(0, 10);
    if (!d) continue;
    const cur =
      byDate.get(d) || {
        date: d,
        events: 0,
        learnMore: 0,
        ctc: 0,
        conversions: 0,
        revenue: 0,
      };
    cur.events += 1;
    if (e.event_name === "Learn More Clicked") cur.learnMore += 1;
    else if (e.event_name === "CTC Clicked") cur.ctc += 1;
    else if (e.event_name === "Base") {
      cur.conversions += 1;
      cur.revenue += toNumber(e.revenue);
    }
    byDate.set(d, cur);
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function resolveLinkCurrency(link, accounts) {
  const account = accounts.find((a) => a.id === link.accountId);
  const currency = account?.currency || link.currency || "USD";
  const needsConversion = currency !== "USD";
  const usdRate =
    needsConversion && link.usdRate
      ? toNumber(link.usdRate)
      : currency === "INR"
        ? DEFAULT_INR_PER_USD
        : 1;
  return {
    currency,
    needsConversion,
    usdRate,
    isDefaultRate: needsConversion && !link.usdRate,
  };
}

// Pull a single Meta campaign's totals + daily series and convert to USD.
async function fetchOneCampaign({ link, range, accounts, token }) {
  const cur = resolveLinkCurrency(link, accounts);
  const toUSD =
    cur.needsConversion && cur.usdRate > 0
      ? (n) => n / cur.usdRate
      : (n) => n;

  let metaError = null;
  let metaTotals = null;
  let metaDaily = [];

  try {
    const totalsRes = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${link.campaignId}/insights`,
      {
        params: {
          fields:
            "spend,impressions,clicks,reach,ctr,cpc,cpm,frequency,actions,cost_per_action_type,unique_clicks,unique_ctr,date_start,date_stop",
          time_range: JSON.stringify(range),
          access_token: token,
        },
      },
    );
    metaTotals = totalsRes.data?.data?.[0] || null;

    const dailyRes = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${link.campaignId}/insights`,
      {
        params: {
          fields: "spend,impressions,clicks,ctr,cpc,actions,date_start",
          time_range: JSON.stringify(range),
          time_increment: 1,
          limit: 500,
          access_token: token,
        },
      },
    );
    metaDaily = dailyRes.data?.data || [];
  } catch (err) {
    metaError =
      err.response?.data?.error?.message ||
      err.message ||
      "Meta API call failed";
  }

  const spendOriginal = toNumber(metaTotals?.spend);
  const cpcOriginal = toNumber(metaTotals?.cpc);
  const cpmOriginal = toNumber(metaTotals?.cpm);
  const spend = toUSD(spendOriginal);
  const impressions = toNumber(metaTotals?.impressions);
  const clicks = toNumber(metaTotals?.clicks);
  const reach = toNumber(metaTotals?.reach);
  const ctr = toNumber(metaTotals?.ctr);
  const cpc = toUSD(cpcOriginal);
  const cpm = toUSD(cpmOriginal);
  const frequency = toNumber(metaTotals?.frequency);
  const uniqueClicks = toNumber(metaTotals?.unique_clicks);
  const linkClicks = pickAction(metaTotals?.actions, "link_click");
  const landingViews = pickAction(metaTotals?.actions, "landing_page_view");
  const metaReportedResults =
    pickAction(metaTotals?.actions, "lead") ||
    pickAction(metaTotals?.actions, "offsite_conversion.fb_pixel_lead") ||
    pickAction(metaTotals?.actions, "onsite_conversion.lead_grouped") ||
    0;
  const metaReportedCPA =
    metaReportedResults > 0 ? spend / metaReportedResults : null;
  const metaReportedCPAOriginal =
    metaReportedResults > 0 ? spendOriginal / metaReportedResults : null;

  const dailyRows = metaDaily.map((r) => ({
    date: r.date_start,
    spend: toUSD(toNumber(r.spend)),
    spendOriginal: toNumber(r.spend),
    impressions: toNumber(r.impressions),
    clicks: toNumber(r.clicks),
    linkClicks: pickAction(r.actions, "link_click"),
  }));

  return {
    link,
    currency: cur,
    metaError,
    meta: {
      spend,
      impressions,
      clicks,
      linkClicks,
      landingViews,
      reach,
      frequency,
      ctr,
      cpc,
      cpm,
      uniqueClicks,
      metaReportedResults,
      metaReportedCPA,
      original: {
        currency: cur.currency,
        spend: spendOriginal,
        cpc: cpcOriginal,
        cpm: cpmOriginal,
        metaReportedCPA: metaReportedCPAOriginal,
      },
    },
    daily: dailyRows,
  };
}

export async function buildMatch({ analyticsCampaign }) {
  const links = getLinkedMetas(analyticsCampaign);
  if (links.length === 0) return { linked: false };

  const events = await getActiveEvents(analyticsCampaign.id);
  const analytics = computeInsights(events);
  const range = analyticsRange(events);

  const token = process.env.FB_TOKEN;
  if (!token) {
    return {
      linked: true,
      links,
      range,
      metaError: "FB_TOKEN missing — set it in .env.local",
    };
  }

  let accounts = [];
  try {
    accounts = await getAccounts();
  } catch {
    // non-fatal — currencies will fall back to USD
  }

  // Fetch all linked campaigns in parallel.
  const perCampaign = await Promise.all(
    links.map((link) => fetchOneCampaign({ link, range, accounts, token })),
  );

  // Aggregate Meta-side totals (everything in USD already from per-campaign).
  const combined = perCampaign.reduce(
    (acc, p) => {
      acc.spend += p.meta.spend;
      acc.impressions += p.meta.impressions;
      acc.clicks += p.meta.clicks;
      acc.linkClicks += p.meta.linkClicks;
      acc.landingViews += p.meta.landingViews;
      acc.reach += p.meta.reach;
      acc.metaReportedResults += p.meta.metaReportedResults;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      landingViews: 0,
      reach: 0,
      metaReportedResults: 0,
    },
  );
  combined.ctr =
    combined.impressions > 0
      ? (combined.clicks / combined.impressions) * 100
      : 0;
  combined.cpc = combined.clicks > 0 ? combined.spend / combined.clicks : 0;
  combined.cpm =
    combined.impressions > 0 ? (combined.spend / combined.impressions) * 1000 : 0;
  combined.metaReportedCPA =
    combined.metaReportedResults > 0
      ? combined.spend / combined.metaReportedResults
      : null;

  // Per-campaign derived metrics — useful to rank which Meta campaign is
  // pulling weight when multiple are linked. Analytics outcomes are shared
  // across all linked campaigns (we can't split conversions by which Meta
  // campaign drove them), so per-campaign ROAS/CPA is spend-relative.
  const sharedRevenue = analytics.revenue;
  const sharedConversions = analytics.conversions;
  const sharedLearnMore =
    analytics.byEventName.find((r) => r.key === "Learn More Clicked")?.count ||
    0;

  for (const p of perCampaign) {
    const s = p.meta.spend;
    const revShare = combined.spend > 0 ? s / combined.spend : 0;
    p.derived = {
      spendShare: combined.spend > 0 ? s / combined.spend : null,
      // Spend-weighted attribution: split shared outcomes by spend share.
      // It's a heuristic, not real per-campaign attribution, but it's the
      // honest version of "this campaign's CPA assuming it pulled its
      // proportional weight of analytics outcomes".
      attributedRevenue: revShare * sharedRevenue,
      attributedConversions: revShare * sharedConversions,
      attributedLearnMore: revShare * sharedLearnMore,
      trueROAS: s > 0 ? (revShare * sharedRevenue) / s : null,
      realCPA:
        revShare * sharedConversions > 0
          ? s / (revShare * sharedConversions)
          : null,
      realCPL:
        revShare * sharedLearnMore > 0 ? s / (revShare * sharedLearnMore) : null,
    };
  }

  // Combined derived metrics (the headline numbers).
  const learnMoreCount = sharedLearnMore;
  const conversions = sharedConversions;
  const revenue = sharedRevenue;
  const trueROAS = combined.spend > 0 ? revenue / combined.spend : null;
  const realCPA = conversions > 0 ? combined.spend / conversions : null;
  const realCPL =
    learnMoreCount > 0 ? combined.spend / learnMoreCount : null;
  const clickGapAbs = combined.linkClicks - learnMoreCount;
  const clickGapPct =
    combined.linkClicks > 0 ? clickGapAbs / combined.linkClicks : null;
  const analyticsCoverage =
    combined.linkClicks > 0 ? learnMoreCount / combined.linkClicks : null;

  // Daily overlay — merge analytics and every per-campaign daily series.
  const trkDaily = analyticsDaily(events);
  const trkMap = new Map(trkDaily.map((r) => [r.date, r]));
  const allDates = new Set(trkMap.keys());
  for (const p of perCampaign) {
    for (const r of p.daily) allDates.add(r.date);
  }
  const daily = Array.from(allDates)
    .sort()
    .map((d) => {
      const t = trkMap.get(d) || {
        events: 0,
        learnMore: 0,
        ctc: 0,
        conversions: 0,
        revenue: 0,
      };
      let spend = 0;
      let metaClicks = 0;
      let metaLinkClicks = 0;
      let impressions = 0;
      for (const p of perCampaign) {
        const m = p.daily.find((r) => r.date === d);
        if (m) {
          spend += m.spend;
          metaClicks += m.clicks;
          metaLinkClicks += m.linkClicks;
          impressions += m.impressions;
        }
      }
      return {
        date: d,
        spend,
        impressions,
        metaClicks,
        metaLinkClicks,
        events: t.events,
        learnMore: t.learnMore,
        ctc: t.ctc,
        conversions: t.conversions,
        revenue: t.revenue,
      };
    });

  // Aggregate any partial errors so the UI can surface them per-link.
  const errors = perCampaign
    .filter((p) => p.metaError)
    .map((p) => ({ campaignId: p.link.campaignId, name: p.link.name, error: p.metaError }));

  return {
    linked: true,
    links,
    range,
    perCampaign,
    combined,
    analytics: {
      totalEvents: analytics.totalEvents,
      learnMoreCount,
      ctcCount:
        analytics.byEventName.find((r) => r.key === "CTC Clicked")?.count || 0,
      conversions,
      revenue,
      avgRevenuePerConversion: analytics.avgRevenuePerConversion,
      uniqueUsers: analytics.uniqueUsers,
      funnel: analytics.funnel,
    },
    derived: {
      trueROAS,
      realCPA,
      realCPL,
      clickGapAbs,
      clickGapPct,
      analyticsCoverage,
    },
    daily,
    errors,
  };
}
