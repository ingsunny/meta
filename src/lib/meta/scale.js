// Diagnostic library that walks every parameter of an item (CTR, CPL,
// frequency, volume, creative health, audience slices) and produces a
// verdict per parameter plus a synthesized "build this ad set" playbook.
//
// Output is intentionally plain-English and ordered: numbers → creative →
// winning audience slices → scale blueprint → drains. Every card carries
// a verdict ({scale, healthy, watch, fix, pending}), a one-line reason,
// and a concrete next action.

import { num, int } from "./format";
import {
  ins,
  getObjKey,
  getResults,
  getResultLabel,
  getScore,
  scoreTier,
  MIN_IMPR_FOR_SIGNAL,
} from "./metrics";
import {
  analyzeDimension,
  dimensionTitle,
  friendlyLabel,
  rowResults,
  costMetricKey,
  costMetricName,
  costUnitLabel,
  volumeNoun,
} from "./audience-insights";

// ── Overall verdict ─────────────────────────────────────────────────────────

export function overallVerdict(item, objective) {
  const score = getScore(item, objective);
  const tier = scoreTier(score);
  const i = ins(item);
  const impressions = int(i.impressions);

  let headline, sub, tone;
  if (impressions < MIN_IMPR_FOR_SIGNAL) {
    headline = "Too early to call — let it run more";
    sub =
      "Below 1,000 impressions, the numbers are too noisy to decide on scaling. Give it a few more days of delivery before optimizing.";
    tone = "pending";
  } else if (score >= 70) {
    headline = "This is performing — scale it";
    sub =
      "The numbers are strong. Below: which audience slices are driving most of the wins. Build a focused ad set around them and put your next budget increase there.";
    tone = "scale";
  } else if (score >= 50) {
    headline = "Working, with room to improve before scaling";
    sub =
      "Most parameters are healthy. Fix the watch / needs-fix items below first — they'll unlock more headroom when you scale.";
    tone = "healthy";
  } else if (score >= 25) {
    headline = "Mixed signals — fix the basics before scaling";
    sub =
      "Several parameters need work. Scaling now would just amplify the issues. Address them, then come back to this tab.";
    tone = "watch";
  } else {
    headline = "Don't scale yet";
    sub =
      "Fundamentals aren't there. More budget would burn faster. Fix the items below first.";
    tone = "fix";
  }

  return { score, tier, headline, sub, tone };
}

// ── Per-metric grades ───────────────────────────────────────────────────────

export function gradeMetrics(item, objective, fmtMoney) {
  const i = ins(item);
  const objKey = getObjKey(objective);
  const impressions = int(i.impressions);
  const ctr = num(i.ctr);
  const cpm = num(i.cpm);
  const cpc = num(i.cpc);
  const freq = num(i.frequency);
  const spend = num(i.spend);
  const results = getResults(item, objective);
  const cpl = results > 0 ? spend / results : null;
  const resultLabel = getResultLabel(objective)?.toLowerCase() || "results";

  const metrics = [];

  if (objKey !== "AWARENESS") {
    metrics.push(gradeCTR(ctr, impressions));
  }

  if (objKey === "TRAFFIC") {
    metrics.push(gradeCPC(cpc, fmtMoney));
  } else if (objKey !== "AWARENESS") {
    metrics.push(gradeCPL(cpl, results, resultLabel, fmtMoney));
  }

  metrics.push(gradeCPM(cpm, impressions, fmtMoney));
  metrics.push(gradeFrequency(freq, impressions));
  metrics.push(gradeVolume(results, resultLabel, impressions));

  return metrics.filter(Boolean);
}

function gradeCTR(ctr, impressions) {
  const base = {
    key: "ctr",
    label: "Click rate (CTR)",
    value: `${ctr.toFixed(2)}%`,
  };
  if (impressions < MIN_IMPR_FOR_SIGNAL) {
    return {
      ...base,
      verdict: "pending",
      headline: "Wait for more impressions",
      reason: `Only ${impressions.toLocaleString("en-IN")} impressions — that's not enough to judge click rate yet.`,
      action: "Let it deliver to at least 1,000 impressions before deciding.",
    };
  }
  if (ctr >= 1.5)
    return {
      ...base,
      verdict: "healthy",
      headline: "Creative earns the click",
      reason: `${ctr.toFixed(2)}% is above the 1.5% benchmark — viewers are responding to your ad.`,
      action: "Keep the creative running. No change needed.",
    };
  if (ctr >= 0.8)
    return {
      ...base,
      verdict: "watch",
      headline: "Click rate is okay, not great",
      reason: `${ctr.toFixed(2)}% — within range but not strong. Strong ads usually clear 1.5%.`,
      action:
        "Test a sharper hook, image, or value prop alongside the current creative.",
    };
  return {
    ...base,
    verdict: "fix",
    headline: "Creative isn't landing",
    reason: `${ctr.toFixed(2)}% is below the 1% floor — most viewers are scrolling past.`,
    action:
      "Refresh the creative: new hook in the first 3 seconds, new image, or rewrite the copy.",
  };
}

function gradeCPL(cpl, results, resultLabel, fmtMoney) {
  const base = { key: "cpl", label: `Cost per ${resultLabel.replace(/s$/, "")}` };
  if (cpl == null) {
    return {
      ...base,
      value: "—",
      verdict: results > 0 ? "watch" : "pending",
      headline: "No cost-per-result yet",
      reason: "Either no conversions tracked, or no spend recorded.",
      action:
        "Verify the conversion event is firing — pixel, lead form, or thank-you page.",
    };
  }
  return {
    ...base,
    value: fmtMoney(cpl),
    verdict: "healthy",
    headline: "Your benchmark",
    reason: `${fmtMoney(cpl)} per ${resultLabel.replace(/s$/, "")} over ${results.toLocaleString("en-IN")} total. Compare to your internal target — only you know what a result is worth to you.`,
    action:
      "Hold this number as you scale. If it climbs by more than ~20% when budget rises, slow down.",
  };
}

function gradeCPC(cpc, fmtMoney) {
  const base = { key: "cpc", label: "Cost per click" };
  if (cpc <= 0) {
    return {
      ...base,
      value: "—",
      verdict: "pending",
      headline: "Wait for clicks",
      reason: "No clicks yet — let it deliver more.",
      action: "",
    };
  }
  return {
    ...base,
    value: fmtMoney(cpc),
    verdict: "healthy",
    headline: "Your CPC benchmark",
    reason: `${fmtMoney(cpc)} per click. Compare to your historical average for this kind of campaign.`,
    action:
      "If CPC creeps up as you scale, the audience may be saturating — widen targeting.",
  };
}

function gradeCPM(cpm, impressions, fmtMoney) {
  const base = { key: "cpm", label: "Reach cost (CPM)" };
  if (impressions === 0 || cpm <= 0) {
    return {
      ...base,
      value: "—",
      verdict: "pending",
      headline: "Wait for delivery",
      reason: "No reach data yet.",
      action: "",
    };
  }
  return {
    ...base,
    value: fmtMoney(cpm),
    verdict: "healthy",
    headline: "What you pay to reach 1,000 people",
    reason: `${fmtMoney(cpm)} to reach 1,000 viewers. This is set by auction competition — cheaper audiences = less crowded auctions.`,
    action:
      "If CPM is climbing over time, the audience may be saturating. Test broader targeting.",
  };
}

function gradeFrequency(freq, impressions) {
  const base = {
    key: "frequency",
    label: "Frequency",
    value: `${freq.toFixed(1)}×`,
  };
  if (impressions < MIN_IMPR_FOR_SIGNAL) {
    return {
      ...base,
      verdict: "pending",
      headline: "Too early to call",
      reason: `${freq.toFixed(1)}× on ${impressions.toLocaleString("en-IN")} impressions — sample too small.`,
      action: "Will firm up as impressions grow.",
    };
  }
  if (freq < 2.5)
    return {
      ...base,
      verdict: "healthy",
      headline: "Audience is fresh",
      reason: `The average viewer has seen this ${freq.toFixed(1)} times. Plenty of headroom.`,
      action:
        "Safe to increase budget — audience won't fatigue soon at this rate.",
    };
  if (freq < 3.5)
    return {
      ...base,
      verdict: "watch",
      headline: "Approaching fatigue zone",
      reason: `${freq.toFixed(1)}× — same viewers are starting to see this often. Click rate usually starts declining past 3.5×.`,
      action:
        "Plan a creative refresh within the next 1–2 weeks before performance dips.",
    };
  return {
    ...base,
    verdict: "fix",
    headline: "Audience is fatigued",
    reason: `${freq.toFixed(1)}× — viewers have seen this too many times. CTR will keep declining if you don't refresh.`,
    action:
      "Refresh creative now, or expand the audience. Don't scale budget on tired creative.",
  };
}

function gradeVolume(results, resultLabel, impressions) {
  const base = {
    key: "volume",
    label: `Total ${resultLabel}`,
    value: results.toLocaleString("en-IN"),
  };
  if (results === 0) {
    if (impressions < 200) {
      return {
        ...base,
        verdict: "pending",
        headline: "Just starting",
        reason: "Not enough delivery to know yet.",
        action: "Wait for more impressions.",
      };
    }
    return {
      ...base,
      verdict: "fix",
      headline: "Spending without results",
      reason: `${impressions.toLocaleString("en-IN")} impressions and zero tracked ${resultLabel}. Either the conversion isn't firing, or the audience/creative is far off.`,
      action:
        "Verify the conversion event fires. Then check audience definition and creative.",
    };
  }
  if (results >= 30)
    return {
      ...base,
      verdict: "healthy",
      headline: "Meaningful volume",
      reason: `${results.toLocaleString("en-IN")} ${resultLabel} — enough to draw solid conclusions from.`,
      action: "Focus on improving efficiency from here.",
    };
  if (results >= 5)
    return {
      ...base,
      verdict: "watch",
      headline: "Small sample",
      reason: `${results.toLocaleString("en-IN")} ${resultLabel} — directionally useful but numbers will be noisy.`,
      action: "Let it run longer before making big optimization calls.",
    };
  return {
    ...base,
    verdict: "watch",
    headline: "Very early",
    reason: `Only ${results.toLocaleString("en-IN")} ${resultLabel} — too few to grade confidently.`,
    action: "Wait for more delivery before scaling or cutting.",
  };
}

// ── Creative health ─────────────────────────────────────────────────────────

export function gradeCreative(item, objective) {
  const i = ins(item);
  const objKey = getObjKey(objective);
  if (objKey === "AWARENESS") return null;

  const impressions = int(i.impressions);
  const ctr = num(i.ctr);
  const freq = num(i.frequency);

  if (impressions < MIN_IMPR_FOR_SIGNAL) {
    return {
      verdict: "pending",
      headline: "Too early to grade the creative",
      reason:
        "Need at least 1,000 impressions before we can judge how the creative is landing.",
      action: "Let it deliver more.",
    };
  }

  if (ctr >= 1.5 && freq < 3.5) {
    return {
      verdict: "healthy",
      headline: "Creative is performing — no change needed",
      reason: `${ctr.toFixed(2)}% click rate with healthy ${freq.toFixed(1)}× frequency. Viewers are responding and the ad isn't worn out yet.`,
      action:
        "Keep it running. Start prepping a refresh variant in the background so you're ready when frequency climbs.",
    };
  }

  if (ctr >= 1.5 && freq >= 3.5) {
    return {
      verdict: "watch",
      headline: "Creative is working but fatiguing",
      reason: `Strong ${ctr.toFixed(2)}% CTR, but frequency hit ${freq.toFixed(1)}× — the same viewers keep seeing it.`,
      action:
        "Launch a refresh variant now, before click rate starts to decline.",
    };
  }

  if (ctr < 0.8 && freq >= 3.5) {
    return {
      verdict: "fix",
      headline: "Creative is burnt out",
      reason: `${freq.toFixed(1)}× frequency combined with low ${ctr.toFixed(2)}% CTR — the audience has seen this too often and stopped responding.`,
      action:
        "Replace the creative or pause this ad. Don't scale budget on burnt creative.",
    };
  }

  if (ctr < 0.8) {
    return {
      verdict: "fix",
      headline: "Creative isn't connecting",
      reason: `${ctr.toFixed(2)}% click rate is below the 1% floor. The hook, image, or message isn't earning attention.`,
      action:
        "Replace creative: new hook in the first 3 seconds, sharper image, or a different angle on the value prop.",
    };
  }

  return {
    verdict: "watch",
    headline: "Creative is borderline",
    reason: `${ctr.toFixed(2)}% click rate at ${freq.toFixed(1)}× frequency. Working, but not great.`,
    action:
      "Test a fresh variant alongside the current ad. Keep whichever wins.",
  };
}

// ── Concrete "what's working" answers ───────────────────────────────────────
// Each helper returns a ranked list. The Scale tab renders these directly
// as "Which AD got most leads / Which CITY got most leads / …" sections.

function objectiveRowCost(row, objective) {
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

function adCost(ad, objective) {
  const k = getObjKey(objective);
  const i = ins(ad);
  const spend = num(i.spend);
  if (k === "AWARENESS") {
    const impressions = int(i.impressions);
    return impressions > 0 ? (spend / impressions) * 1000 : null;
  }
  if (k === "TRAFFIC") {
    const clicks = int(i.clicks);
    return clicks > 0 ? spend / clicks : null;
  }
  const results = getResults(ad, objective);
  return results > 0 ? spend / results : null;
}

// Top ads ranked by the objective's primary volume (leads / purchases /
// clicks / reach). Skips zero-volume ads so the list stays honest.
export function topAds(ads, objective, limit = 5) {
  if (!ads || ads.length === 0) return [];
  const k = getObjKey(objective);
  return ads
    .map((ad) => {
      const i = ins(ad);
      const spend = num(i.spend);
      const impressions = int(i.impressions);
      const clicks = int(i.clicks);
      const results = getResults(ad, objective);
      const volume =
        k === "AWARENESS" ? impressions : k === "TRAFFIC" ? clicks : results;
      return {
        id: ad.id,
        name: ad.name,
        thumbnail: ad.creative?.thumbnail_url,
        spend,
        impressions,
        clicks,
        results,
        volume,
        cost: adCost(ad, objective),
      };
    })
    .filter((a) => a.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

// Top breakdown rows for a given dimension, ranked by the objective's
// primary volume. Used for "which CITY / PLATFORM / PLACEMENT got most …".
export function topRowsByVolume(rows, dimension, objective, limit = 5) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const k = getObjKey(objective);
  return rows
    .map((row) => {
      const label = friendlyLabel(row, dimension);
      const spend = num(row.spend);
      const impressions = int(row.impressions);
      const clicks = int(row.clicks);
      const results = rowResults(row, objective);
      const volume =
        k === "AWARENESS" ? impressions : k === "TRAFFIC" ? clicks : results;
      return {
        label,
        spend,
        impressions,
        clicks,
        results,
        volume,
        cost: objectiveRowCost(row, objective),
      };
    })
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

// Top breakdown rows specifically ranked by CLICKS — used for the age
// section, since the user wants click intent as a proxy when leads are
// sparse per slice.
export function topRowsByClicks(rows, dimension, limit = 5) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((row) => {
      const label = friendlyLabel(row, dimension);
      const spend = num(row.spend);
      const impressions = int(row.impressions);
      const clicks = int(row.clicks);
      const ctr = num(row.ctr);
      return { label, spend, impressions, clicks, ctr };
    })
    .filter((r) => r.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}

// ── Direction lines (data-driven push / leave guidance per topic) ───────────
// Each helper inspects the ranked list and returns { push, leave } — two
// short sentences telling the user where to consolidate spend and what to
// stop running. The wording adapts to how concentrated the leader's share is.

function pushLeave(push, leave) {
  return { push, leave };
}

function leaderShare(items) {
  if (!items || items.length === 0) return 0;
  const total = items.reduce((s, x) => s + (x.volume || 0), 0);
  if (total === 0) return 0;
  return (items[0].volume || 0) / total;
}

export function adDirection(topAdsList, noun) {
  if (!topAdsList || topAdsList.length === 0) return null;
  const winner = topAdsList[0];
  const share = leaderShare(topAdsList);

  if (topAdsList.length === 1) {
    return pushLeave(
      `"${winner.name}" is your only ad producing ${noun} right now — there's no horse race to learn from yet.`,
      `Launch 2–3 fresh variations alongside it. Without contrast you can't tell what's the creative versus the targeting.`,
    );
  }

  if (share >= 0.5) {
    return pushLeave(
      `Shift more budget to "${winner.name}" — it's pulling roughly ${Math.round(share * 100)}% of all ${noun} on its own.`,
      `Pause or refresh anything outside the top 3 — the long tail is diluting delivery on your winner.`,
    );
  }

  const topNames = topAdsList.slice(0, 3).map((a) => `"${a.name}"`).join(", ");
  return pushLeave(
    `Lean into the top 3 — ${topNames}. They're earning the ${noun}.`,
    `Pause the long-tail ads so spend consolidates on what's working, then add 1–2 fresh variations against the leaders.`,
  );
}

export function audienceDirection(topAudienceList, noun) {
  if (!topAudienceList || topAudienceList.length === 0) return null;
  const winner = topAudienceList[0];
  const share = leaderShare(topAudienceList);

  if (topAudienceList.length === 1) {
    return pushLeave(
      `Your wins are concentrated in "${winner.label}".`,
      `Build a dedicated ad set targeted to this segment and test how much further it can scale.`,
    );
  }

  if (share >= 0.4) {
    return pushLeave(
      `"${winner.label}" is your strongest segment — ${Math.round(share * 100)}% of all ${noun}.`,
      `Tighten ad-set targeting around this profile. Drop segments outside the top 2 to stop wasting impressions.`,
    );
  }

  const topLabels = topAudienceList.slice(0, 3).map((a) => `"${a.label}"`).join(", ");
  return pushLeave(
    `Split spend across the top 2–3 segments: ${topLabels}. They're each pulling their weight.`,
    `Don't over-narrow yet — the data is spread, so cutting too aggressively risks losing delivery.`,
  );
}

export function platformDirection(topPlatformsList, noun) {
  if (!topPlatformsList || topPlatformsList.length === 0) return null;
  const winner = topPlatformsList[0];
  const share = leaderShare(topPlatformsList);

  if (topPlatformsList.length === 1) {
    return pushLeave(
      `All ${noun} are coming from ${winner.label}.`,
      `If other platforms are enabled they're getting no traction — keep this single-platform setup and move on.`,
    );
  }

  if (share >= 0.6) {
    return pushLeave(
      `${winner.label} is dominating — ${Math.round(share * 100)}% of all ${noun}.`,
      `Exclude the weakest platform from this ad set to consolidate delivery on the winner.`,
    );
  }

  const topLabels = topPlatformsList.slice(0, 2).map((p) => p.label).join(" + ");
  return pushLeave(
    `Keep ${topLabels} active — both are producing ${noun}.`,
    `If Audience Network or Messenger sits at the bottom with weak volume, exclude it to stop bleeding spend on the wrong feeds.`,
  );
}

export function placementDirection(topPlacementsList, noun) {
  if (!topPlacementsList || topPlacementsList.length === 0) return null;
  const winner = topPlacementsList[0];
  const share = leaderShare(topPlacementsList);

  if (topPlacementsList.length === 1) {
    return pushLeave(
      `All ${noun} are landing on ${winner.label}.`,
      `Open the ad set and uncheck every other placement — they're not delivering for you.`,
    );
  }

  if (share >= 0.5) {
    return pushLeave(
      `${winner.label} is doing the heavy lifting — ${Math.round(share * 100)}% of all ${noun}.`,
      `Drop placements below the top 3 to consolidate spend where it converts.`,
    );
  }

  const topLabels = topPlacementsList.slice(0, 3).map((p) => p.label).join(", ");
  return pushLeave(
    `Lean into the top 3 placements: ${topLabels}.`,
    `Anything outside that group is likely a delivery filler — exclude it from the ad set.`,
  );
}

// ── Drains (worth flagging only if significant) ─────────────────────────────

export function findDrains(breakdowns, objective) {
  const drains = [];
  const costKey = costMetricKey(objective);

  Object.entries(breakdowns).forEach(([dim, rows]) => {
    if (!Array.isArray(rows)) return;
    const a = analyzeDimension(rows, dim, objective);
    if (!a) return;
    if (!a.worstCost || !a.bestCost) return;
    if (a.worstCost.cost < a.bestCost.cost * 1.7) return;
    if (a.worstCost.spendShare < 0.05) return;

    drains.push({
      dimension: dim,
      dimensionLabel: dimensionTitle(dim),
      sliceLabel: a.worstCost.label,
      cost: a.worstCost.cost,
      spend: a.worstCost.spend,
      spendShare: a.worstCost.spendShare,
      results: a.worstCost.results,
      resultShare: a.worstCost.resultShare,
      ratioVsBest: a.worstCost.cost / a.bestCost.cost,
      bestSliceLabel: a.bestCost.label,
      bestSliceCost: a.bestCost.cost,
      costKey,
    });
  });
  return drains;
}

// ── Synthesized scale blueprint ─────────────────────────────────────────────
// Inputs are the *concrete* top-lists from the Scale tab so the playbook
// reads like a direct summary of what's already on screen.
//
// The blueprint is rich on purpose: each recipe line carries its own context
// (share + cost-vs-avg), there's a confidence verdict, a budget recommendation,
// a projected outcome, and any risk warnings — all derived from the data.

// Project total volume from a budget given a cost-per-unit, respecting the
// objective's denominator (impressions-per-1000 for CPM, otherwise 1-to-1).
function projectVolumeFromCost(budget, costPerUnit, objKey) {
  if (!budget || !costPerUnit || costPerUnit <= 0) return null;
  if (objKey === "AWARENESS") return (budget / costPerUnit) * 1000;
  return budget / costPerUnit;
}

export function buildPlaybook({
  item,
  objective,
  topAdsList = [],
  topAudienceList = [],
  topPlatformsList = [],
  topPlacementsList = [],
}) {
  const topAd = topAdsList[0];
  const topAudience = topAudienceList[0];
  const topPlatform = topPlatformsList[0];
  const topPlacement = topPlacementsList[0];

  const i = ins(item);
  const objKey = getObjKey(objective);
  const spend = num(i.spend);
  const impressions = int(i.impressions);
  const clicks = int(i.clicks);
  const results = getResults(item, objective);
  const ctr = num(i.ctr);
  const frequency = num(i.frequency);

  // Item-level totals used for share calcs and projection.
  const totalVolume =
    objKey === "AWARENESS"
      ? impressions
      : objKey === "TRAFFIC"
        ? clicks
        : results;

  let currentCost = null;
  if (objKey === "AWARENESS") {
    currentCost = impressions > 0 ? (spend / impressions) * 1000 : null;
  } else if (objKey === "TRAFFIC") {
    currentCost = clicks > 0 ? spend / clicks : null;
  } else {
    currentCost = results > 0 ? spend / results : null;
  }

  // Per-line context: "% of total · X% cheaper than the avg" style chips.
  const buildContext = (sliceVolume, sliceCost) => {
    const chips = [];
    if (totalVolume > 0 && sliceVolume > 0) {
      const pct = Math.round((sliceVolume / totalVolume) * 100);
      chips.push({ kind: "share", text: `${pct}% of total` });
    }
    if (sliceCost != null && currentCost != null && currentCost > 0) {
      const ratio = sliceCost / currentCost;
      if (ratio < 0.85) {
        chips.push({
          kind: "better",
          text: `${Math.round((1 - ratio) * 100)}% cheaper than avg`,
        });
      } else if (ratio > 1.15) {
        chips.push({
          kind: "worse",
          text: `${Math.round((ratio - 1) * 100)}% more expensive`,
        });
      } else if (ratio > 0) {
        chips.push({ kind: "neutral", text: "near the campaign avg" });
      }
    }
    return chips;
  };

  const lines = [];
  const pushLine = (key, label, slice) => {
    if (!slice) return;
    lines.push({
      key,
      label,
      value: slice.label || slice.name,
      context: buildContext(slice.volume, slice.cost),
      sliceVolume: slice.volume || 0,
      sliceCost: slice.cost,
    });
  };
  pushLine("audience", "Audience", topAudience);
  pushLine("platform", "Platform", topPlatform);
  pushLine("placement", "Placement", topPlacement);
  pushLine("ad", "Scale ad", topAd);

  if (lines.length === 0) return null;

  // Avg winner cost — the mean of cost-per-X across the picked slices.
  const candidates = [topAd, topAudience, topPlatform, topPlacement].filter(
    (x) => x && x.cost != null,
  );
  const avgWinnerCost =
    candidates.length > 0
      ? candidates.reduce((s, x) => s + x.cost, 0) / candidates.length
      : null;

  const improvementPct =
    avgWinnerCost && currentCost && avgWinnerCost < currentCost
      ? ((currentCost - avgWinnerCost) / currentCost) * 100
      : null;

  // Confidence is bounded by the *weakest* line's volume — one thin slice
  // poisons the whole recipe.
  const sliceVolumes = lines
    .map((l) => l.sliceVolume)
    .filter((v) => v > 0);
  const minSliceVolume =
    sliceVolumes.length > 0 ? Math.min(...sliceVolumes) : 0;

  let confidence, confidenceReason, budgetMultiplier, budgetRationale;
  if (minSliceVolume >= 30) {
    confidence = "strong";
    confidenceReason = `Each winning slice has 30+ ${volumeNoun(objective)} behind it — enough signal to act on.`;
    budgetMultiplier = 1.5;
    budgetRationale =
      "Push 1.5× current spend — the cheaper winners should absorb the extra delivery without crashing your cost.";
  } else if (minSliceVolume >= 5) {
    confidence = "early";
    confidenceReason = `Winning slices have 5–29 ${volumeNoun(objective)} — directionally useful but the numbers will move as you scale.`;
    budgetMultiplier = 1.0;
    budgetRationale =
      "Match current spend on the focused ad set — same delivery pace, but concentrated on what's working.";
  } else {
    confidence = "thin";
    confidenceReason = `Some winning slices have under 5 ${volumeNoun(objective)} — treat the recipe as a hypothesis to validate, not a sure bet.`;
    budgetMultiplier = 0.5;
    budgetRationale =
      "Start at 50% of current spend — too little data to justify scaling. Prove it works first, then double.";
  }

  // Projected volume at suggested budget.
  const newSpend = spend > 0 ? spend * budgetMultiplier : null;
  const projectedMid = projectVolumeFromCost(newSpend, avgWinnerCost, objKey);
  const projected = projectedMid
    ? {
        mid: projectedMid,
        low: projectedMid * 0.75,
        high: projectedMid * 1.2,
      }
    : null;

  // Risk warnings — surface 0–3 actionable things to watch as the user scales.
  const warnings = [];
  if (frequency >= 3.5 && impressions >= MIN_IMPR_FOR_SIGNAL) {
    warnings.push({
      key: "frequency",
      headline: "Audience is fatiguing",
      body: `Frequency hit ${frequency.toFixed(1)}× — the same viewers keep seeing this. Refresh the creative before scaling or the cost gains will reverse.`,
    });
  }
  if (
    topAudienceList.length >= 2 &&
    totalVolume > 0 &&
    topAudience &&
    topAudience.volume / totalVolume >= 0.6
  ) {
    const sharePct = Math.round((topAudience.volume / totalVolume) * 100);
    warnings.push({
      key: "concentration",
      headline: "Most signal is in one segment",
      body: `${sharePct}% of all ${volumeNoun(objective)} come from "${topAudience.label}". Diversify with a second ad set after the first scale or you'll cap out when this segment saturates.`,
    });
  }
  if (confidence === "thin") {
    warnings.push({
      key: "thin",
      headline: "Sample is small",
      body: `The weakest winning slice has only ${minSliceVolume} ${volumeNoun(objective)}. Real numbers may vary widely — start small.`,
    });
  }
  if (
    objKey !== "AWARENESS" &&
    ctr > 0 &&
    ctr < 1.0 &&
    impressions >= MIN_IMPR_FOR_SIGNAL
  ) {
    warnings.push({
      key: "ctr",
      headline: "Creative isn't earning the click",
      body: `Overall CTR is ${ctr.toFixed(2)}% (below the 1% floor). Even with the right audience, weak creative will keep cost-per-result high. Refresh first.`,
    });
  }

  return {
    lines,
    avgWinnerCost,
    currentCost,
    improvementPct,
    confidence,
    confidenceReason,
    minSliceVolume,
    budgetMultiplier,
    budgetRationale,
    totalSpend: spend,
    newSpend,
    projected,
    warnings: warnings.slice(0, 3),
    totalVolume,
    objKey,
    costKey: costMetricKey(objective),
    costName: costMetricName(objective),
    costUnit: costUnitLabel(objective),
    volumeNoun: volumeNoun(objective),
    resultLabel: getResultLabel(objective) || "results",
  };
}
