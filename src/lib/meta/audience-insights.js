// Analyzes audience breakdown rows (age, gender, placement, country, device,
// hour) and surfaces plain-English insights: best/worst slices, fair-share
// efficiency, underbudgeted heroes, money-burning wasters.
//
// Breakdown rows come from /api/meta/breakdown and have the flat insights
// shape (spend, impressions, clicks, ctr, cpm, actions[]) plus the dimension
// key (age, gender, country, publisher_platform+platform_position, etc.).

import { num, int } from "./format";
import { getObjKey } from "./metrics";

const RESULT_ACTIONS = {
  LEADS: ["lead"],
  SALES: ["purchase", "omni_purchase"],
  ENGAGEMENT: ["post_engagement", "page_engagement"],
  APP_PROMOTION: ["app_install", "mobile_app_install"],
};

// Count results in a breakdown row (which doesn't have the node wrapper).
export function rowResults(row, objective) {
  const objKey = getObjKey(objective);
  if (objKey === "AWARENESS") return int(row.reach);
  if (objKey === "TRAFFIC") return int(row.clicks);
  const types = RESULT_ACTIONS[objKey] || [];
  const m = (row.actions || []).find((a) => types.includes(a.action_type));
  return m ? int(m.value) : 0;
}

// Convert raw breakdown-row codes into something a non-technical user reads
// without needing to know Facebook's internal taxonomy.
export function friendlyLabel(row, dimension) {
  if (dimension === "age") return `Ages ${row.age || "—"}`;
  if (dimension === "gender") {
    const g = (row.gender || "").toLowerCase();
    if (g === "male") return "Men";
    if (g === "female") return "Women";
    return "Unknown / other";
  }
  if (dimension === "country") return row.country || "—";
  if (dimension === "region") return row.region || "—";
  if (dimension === "age_gender") {
    const g = (row.gender || "").toLowerCase();
    const a = row.age || "—";
    if (g === "male") return `Men, ages ${a}`;
    if (g === "female") return `Women, ages ${a}`;
    return `Ages ${a}`;
  }
  if (dimension === "region") return row.region || "—";
  if (dimension === "platform") {
    const p = (row.publisher_platform || "").toLowerCase();
    if (p === "facebook") return "Facebook";
    if (p === "instagram") return "Instagram";
    if (p === "audience_network") return "Audience Network";
    if (p === "messenger") return "Messenger";
    return row.publisher_platform || "—";
  }
  if (dimension === "placement") {
    return friendlyPlacement(row.publisher_platform, row.platform_position);
  }
  if (dimension === "device") {
    const d = (row.impression_device || "").toLowerCase();
    if (d === "iphone") return "iPhone";
    if (d === "ipad") return "iPad";
    if (d === "android_smartphone") return "Android phone";
    if (d === "android_tablet") return "Android tablet";
    if (d === "desktop") return "Desktop";
    return row.impression_device || "—";
  }
  if (dimension === "hour") {
    const raw = row.hourly_stats_aggregated_by_advertiser_time_zone || "";
    const m = raw.match(/^(\d{2}):/);
    if (!m) return raw || "—";
    const h = parseInt(m[1], 10);
    const display = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    return display;
  }
  return "—";
}

function friendlyPlacement(platformRaw, positionRaw) {
  const p = (platformRaw || "").toLowerCase();
  const pos = (positionRaw || "").toLowerCase();
  if (p === "facebook") {
    if (pos === "feed") return "Facebook Feed";
    if (pos === "story") return "Facebook Stories";
    if (pos === "instream_video") return "Facebook in-stream video";
    if (pos === "marketplace") return "Facebook Marketplace";
    if (pos === "right_hand_column") return "Facebook right column";
    if (pos === "video_feeds") return "Facebook video feeds";
    if (pos === "search") return "Facebook search";
    return pos ? `Facebook · ${pos}` : "Facebook";
  }
  if (p === "instagram") {
    if (pos === "feed" || pos === "stream") return "Instagram Feed";
    if (pos === "story") return "Instagram Stories";
    if (pos === "reels") return "Instagram Reels";
    if (pos === "explore") return "Instagram Explore";
    return pos ? `Instagram · ${pos}` : "Instagram";
  }
  if (p === "audience_network") {
    if (pos === "classic") return "Audience Network · Classic";
    if (pos === "instream_video") return "Audience Network · in-stream video";
    if (pos === "rewarded_video") return "Audience Network · rewarded video";
    return pos ? `Audience Network · ${pos}` : "Audience Network";
  }
  if (p === "messenger") {
    if (pos === "messenger_home") return "Messenger Inbox";
    return pos ? `Messenger · ${pos}` : "Messenger";
  }
  return pos ? `${p || "—"} · ${pos}` : p || "—";
}

export function dimensionTitle(dim) {
  return (
    {
      age: "age",
      gender: "gender",
      age_gender: "audience segment",
      country: "country",
      region: "city / region",
      platform: "platform",
      placement: "placement",
      device: "device",
      hour: "time of day",
    }[dim] || dim
  );
}

// ── Objective-aware cost helpers ────────────────────────────────────────────
// Different objectives have different "primary cost" metrics:
//   AWARENESS    → CPM (cost to reach 1,000 people)
//   TRAFFIC      → CPC (cost per click)
//   LEADS        → CPL (cost per lead)
//   SALES        → CPA (cost per purchase)
//   ENGAGEMENT   → CPE (cost per engagement)
//   APP_PROMOTION→ CPI (cost per install)
//
// Ranking by the wrong metric is what produced earlier bugs like crowning a
// 2am slot with 0 clicks just because it had non-zero spend. The volume floor
// and the cost metric BOTH need to match the objective.

export function costMetricKey(objective) {
  const k = getObjKey(objective);
  if (k === "AWARENESS") return "cpm";
  if (k === "TRAFFIC") return "cpc";
  if (k === "LEADS") return "cpl";
  if (k === "SALES") return "cpa";
  if (k === "ENGAGEMENT") return "cpe";
  if (k === "APP_PROMOTION") return "cpi";
  return "cpa";
}

export function costMetricName(objective) {
  return (
    {
      cpm: "CPM",
      cpc: "CPC",
      cpl: "CPL",
      cpa: "CPA",
      cpe: "CPE",
      cpi: "CPI",
    }[costMetricKey(objective)] || "CPA"
  );
}

export function costUnitLabel(objective) {
  return (
    {
      cpm: "to reach 1,000 people",
      cpc: "per click",
      cpl: "per lead",
      cpa: "per purchase",
      cpe: "per engagement",
      cpi: "per install",
    }[costMetricKey(objective)] || "per result"
  );
}

export function volumeNoun(objective) {
  const k = getObjKey(objective);
  return (
    {
      LEADS: "leads",
      SALES: "purchases",
      TRAFFIC: "clicks",
      AWARENESS: "people reached",
      ENGAGEMENT: "engagements",
      APP_PROMOTION: "installs",
    }[k] || "results"
  );
}

// Returns the primary per-unit cost for a breakdown row, matched to objective.
export function rowPrimaryCost(row, objective) {
  const k = getObjKey(objective);
  const spend = num(row.spend);
  if (k === "AWARENESS") {
    const impressions = int(row.impressions);
    return impressions > 0 ? (spend / impressions) * 1000 : null;
  }
  if (k === "TRAFFIC") {
    const clicks = int(row.clicks);
    return clicks > 0 ? spend / clicks : null;
  }
  const results = rowResults(row, objective);
  return results > 0 ? spend / results : null;
}

// Minimum volume a slice must clear to be eligible as a "best" candidate.
// Tuned so noise (e.g. 65 impressions, 0 clicks) cannot crown a winner.
function meetsVolumeFloor(slice, objective) {
  const k = getObjKey(objective);
  if (k === "AWARENESS") return slice.impressions >= 1000;
  if (k === "TRAFFIC") return slice.clicks >= 5;
  return slice.results >= 1;
}

export function volumeFloorDescription(objective) {
  const k = getObjKey(objective);
  if (k === "AWARENESS") return "≥1,000 impressions";
  if (k === "TRAFFIC") return "≥5 clicks";
  return "≥1 tracked result";
}

// Action verb hint per dimension (used when generating recommendations).
export function actionHintForDimension(dim, sliceLabel, direction /* "cut" | "scale" */) {
  if (direction === "cut") {
    if (dim === "placement")
      return `Open the ad set and remove "${sliceLabel}" from Placements.`;
    if (dim === "country")
      return `Remove "${sliceLabel}" from your location targeting.`;
    if (dim === "hour")
      return `Set a custom ad schedule to skip ${sliceLabel}.`;
    if (dim === "age" || dim === "gender")
      return `Narrow the age/gender range to exclude "${sliceLabel}".`;
    if (dim === "device")
      return `Add a device exclusion for "${sliceLabel}" (Ad Sets → Advanced).`;
    return `Reduce spend on "${sliceLabel}" or exclude it from targeting.`;
  }
  if (dim === "placement")
    return `Make "${sliceLabel}" the primary placement, or split it into a dedicated ad set so it gets the spend it deserves.`;
  if (dim === "hour")
    return `Concentrate budget on ${sliceLabel} with a custom ad schedule.`;
  if (dim === "country")
    return `Build a dedicated ad set for "${sliceLabel}" — it's punching above its weight.`;
  if (dim === "age" || dim === "gender")
    return `Build a dedicated ad set targeting "${sliceLabel}" — your highest-converting audience.`;
  if (dim === "device")
    return `Create a "${sliceLabel}"-only ad set so it gets a fair share of budget.`;
  return `Shift more budget toward "${sliceLabel}".`;
}

// Take rows for one dimension and return a rich analysis object.
// Returns null if there isn't enough data to draw conclusions.
//
// All ranking is objective-aware: TRAFFIC ranks by CPC, AWARENESS by CPM,
// LEADS/SALES/ENGAGEMENT/APP_PROMOTION by cost-per-result. Volume floors
// match too — a slice must clear ≥5 clicks (TRAFFIC), ≥1,000 impressions
// (AWARENESS), or ≥1 result (everything else) to be eligible as a winner.
export function analyzeDimension(rows, dimension, objective) {
  if (!rows || rows.length === 0) return null;

  const objKey = getObjKey(objective);
  const costKey = costMetricKey(objective);

  const raw = rows
    .map((row) => {
      const label = friendlyLabel(row, dimension);
      const spend = num(row.spend);
      const impressions = int(row.impressions);
      const clicks = int(row.clicks);
      const results = rowResults(row, objective);
      const ctr = num(row.ctr);
      const cpm = num(row.cpm);
      const cpc = num(row.cpc);
      const cost = rowPrimaryCost(row, objective);
      return {
        label,
        spend,
        impressions,
        clicks,
        results,
        ctr,
        cpm,
        cpc,
        cost,
      };
    })
    .filter((s) => s.spend > 0 || s.impressions > 100);

  if (raw.length === 0) return null;

  const totalSpend = raw.reduce((s, x) => s + x.spend, 0);
  const totalResults = raw.reduce((s, x) => s + x.results, 0);
  const totalImpressions = raw.reduce((s, x) => s + x.impressions, 0);
  const totalClicks = raw.reduce((s, x) => s + x.clicks, 0);

  // resultShare denominator depends on what "result" means for the objective.
  // For AWARENESS the natural volume is impressions/reach, for TRAFFIC it's
  // clicks; for conversion objectives it's the tracked result count.
  const shareDenominator =
    objKey === "AWARENESS"
      ? totalImpressions
      : objKey === "TRAFFIC"
        ? totalClicks
        : totalResults;
  const shareNumeratorOf = (s) =>
    objKey === "AWARENESS"
      ? s.impressions
      : objKey === "TRAFFIC"
        ? s.clicks
        : s.results;

  const slices = raw.map((s) => {
    const spendShare = totalSpend > 0 ? s.spend / totalSpend : 0;
    const resultShare =
      shareDenominator > 0 ? shareNumeratorOf(s) / shareDenominator : 0;
    const impressionShare =
      totalImpressions > 0 ? s.impressions / totalImpressions : 0;
    // Positive efficiency = slice delivers more than its budget share would
    // predict; negative = drag on the account.
    const efficiency = resultShare - spendShare;
    return { ...s, spendShare, resultShare, impressionShare, efficiency };
  });

  // Threshold so we don't crown a winner from 3 impressions of noise.
  const MIN_SPEND = Math.max(50, totalSpend * 0.03);
  const MIN_IMPR = Math.max(500, totalImpressions * 0.02);

  const costPool = slices.filter(
    (s) =>
      s.cost != null &&
      s.spend >= MIN_SPEND &&
      meetsVolumeFloor(s, objective),
  );
  const bestCost =
    costPool.length > 0
      ? costPool.reduce((b, s) => (s.cost < b.cost ? s : b))
      : null;
  const worstCost =
    costPool.length > 0
      ? costPool.reduce((b, s) => (s.cost > b.cost ? s : b))
      : null;

  const ctrPool = slices.filter((s) => s.impressions >= MIN_IMPR);
  const bestCtr =
    ctrPool.length > 0 ? ctrPool.reduce((b, s) => (s.ctr > b.ctr ? s : b)) : null;
  const worstCtr =
    ctrPool.length > 0 ? ctrPool.reduce((b, s) => (s.ctr < b.ctr ? s : b)) : null;

  const topSpender =
    slices.length > 0
      ? slices.reduce((b, s) => (s.spend > b.spend ? s : b))
      : null;
  const topResulter =
    shareDenominator > 0
      ? slices.reduce((b, s) =>
          shareNumeratorOf(s) > shareNumeratorOf(b) ? s : b,
        )
      : null;

  const heroes = slices
    .filter(
      (s) =>
        s.efficiency > 0.05 &&
        meetsVolumeFloor(s, objective) &&
        s.spendShare > 0.02 &&
        s.spend >= MIN_SPEND,
    )
    .sort((a, b) => b.efficiency - a.efficiency);

  const wasters = slices
    .filter((s) => s.efficiency < -0.05 && s.spendShare > 0.05)
    .sort((a, b) => a.efficiency - b.efficiency);

  const top2Share = [...slices]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 2)
    .reduce((s, x) => s + x.spendShare, 0);

  // Account-level "average" cost computed with the right denominator —
  // total spend ÷ total volume — so comparisons against avgCost are honest
  // even when slices have wildly different volumes.
  let avgCost = null;
  if (objKey === "AWARENESS") {
    avgCost = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;
  } else if (objKey === "TRAFFIC") {
    avgCost = totalClicks > 0 ? totalSpend / totalClicks : null;
  } else {
    avgCost = totalResults > 0 ? totalSpend / totalResults : null;
  }

  return {
    dimension,
    objective,
    objectiveKey: objKey,
    costKey,
    slices: slices.sort((a, b) => b.spend - a.spend),
    bestCost,
    worstCost,
    bestCtr,
    worstCtr,
    topSpender,
    topResulter,
    heroes,
    wasters,
    totalSpend,
    totalResults,
    totalImpressions,
    totalClicks,
    top2Share,
    avgCost,
    // Back-compat aliases (will be removed after migration is complete).
    bestCpl: bestCost,
    worstCpl: worstCost,
    avgCpl: avgCost,
  };
}
