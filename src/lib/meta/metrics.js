import { num, int } from "./format";
import { isDelivering } from "./status";

// Minimum impressions before frequency/CTR derived signals are trustworthy.
// Below this, we treat metrics as "not enough data" rather than alarming.
export const MIN_IMPR_FOR_SIGNAL = 1000;

export function hasMeaningfulSignal(node) {
  return int(ins(node).impressions) >= MIN_IMPR_FOR_SIGNAL;
}

export function isFatigued(node) {
  return hasMeaningfulSignal(node) && num(ins(node).frequency) > 3.5;
}

export const OBJECTIVES = {
  LEADS: { label: "Lead Gen", swatch: "bg-violet-500", soft: "bg-violet-50 text-violet-700" },
  TRAFFIC: { label: "Traffic", swatch: "bg-blue-500", soft: "bg-blue-50 text-blue-700" },
  AWARENESS: { label: "Awareness", swatch: "bg-cyan-500", soft: "bg-cyan-50 text-cyan-700" },
  SALES: { label: "Sales", swatch: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700" },
  ENGAGEMENT: { label: "Engagement", swatch: "bg-amber-500", soft: "bg-amber-50 text-amber-700" },
  APP_PROMOTION: { label: "App Promo", swatch: "bg-pink-500", soft: "bg-pink-50 text-pink-700" },
};

export const ins = (n) => n?.insights?.data?.[0] || {};

export function getObjKey(objective) {
  const s = (objective || "").replace("OUTCOME_", "");
  return OBJECTIVES[s] ? s : "TRAFFIC";
}

export function getObjConfig(objective) {
  return OBJECTIVES[getObjKey(objective)];
}

const findAction = (actions = [], types) => {
  const m = actions.find((a) => types.includes(a.action_type));
  return m ? int(m.value) : 0;
};

export function getResults(node, objectiveOverride) {
  const objKey = getObjKey(objectiveOverride ?? node?.objective);
  const i = ins(node);
  const acts = i.actions || [];

  if (objKey === "LEADS") return findAction(acts, ["lead"]);
  if (objKey === "SALES") return findAction(acts, ["purchase", "omni_purchase"]);
  if (objKey === "ENGAGEMENT")
    return findAction(acts, ["post_engagement", "page_engagement"]);
  if (objKey === "APP_PROMOTION")
    return findAction(acts, ["app_install", "mobile_app_install"]);
  if (objKey === "AWARENESS") return int(i.reach);
  return int(i.clicks);
}

export function getResultLabel(objective) {
  return {
    LEADS: "Leads",
    SALES: "Sales",
    ENGAGEMENT: "Engagements",
    APP_PROMOTION: "Installs",
    TRAFFIC: "Clicks",
    AWARENESS: "Reach",
  }[getObjKey(objective)];
}

export function getPrimaryKPI(node, objectiveOverride) {
  const objKey = getObjKey(objectiveOverride ?? node?.objective);
  const i = ins(node);
  const spend = num(i.spend);
  const label = {
    LEADS: "CPL",
    SALES: "CPA",
    ENGAGEMENT: "CPE",
    APP_PROMOTION: "CPI",
    TRAFFIC: "CPC",
    AWARENESS: "CPM",
  }[objKey];

  let raw = null;
  if (objKey === "AWARENESS") raw = spend > 0 ? num(i.cpm) : null;
  else if (objKey === "TRAFFIC") raw = spend > 0 ? num(i.cpc) : null;
  else {
    const r = getResults(node, objectiveOverride);
    raw = r > 0 ? spend / r : null;
  }
  return { label, raw };
}

export function getScore(node, objectiveOverride) {
  const objKey = getObjKey(objectiveOverride ?? node?.objective);
  const i = ins(node);
  const spend = num(i.spend);
  const ctr = num(i.ctr);
  const cpm = num(i.cpm);
  const cpc = num(i.cpc);
  const freq = num(i.frequency);
  const results = getResults(node, objectiveOverride);

  let score = 0;
  if (isDelivering(node)) score += 8;
  if (spend > 0) score += 7;
  // Only penalize frequency if there's enough volume for the ratio to mean something.
  if (int(i.impressions) >= MIN_IMPR_FOR_SIGNAL) {
    if (freq > 5) score -= 10;
    else if (freq > 3) score -= 4;
  }

  if (objKey !== "AWARENESS") {
    if (ctr >= 3) score += 25;
    else if (ctr >= 2) score += 20;
    else if (ctr >= 1) score += 13;
    else if (ctr >= 0.5) score += 7;
    else if (ctr > 0) score += 3;
  }

  if (objKey === "AWARENESS") {
    if (cpm > 0 && cpm < 30) score += 25;
    else if (cpm < 70) score += 18;
    else if (cpm < 150) score += 10;
    else if (cpm > 0) score += 3;
    const reach = int(i.reach);
    if (reach > 50000) score += 15;
    else if (reach > 10000) score += 10;
    else if (reach > 0) score += 4;
  } else if (objKey === "TRAFFIC") {
    if (cpc > 0 && cpc < 5) score += 35;
    else if (cpc < 15) score += 25;
    else if (cpc < 30) score += 14;
    else if (cpc > 0) score += 5;
  } else {
    if (results > 0 && spend > 0) {
      const cpa = spend / results;
      if (cpa < 300) score += 35;
      else if (cpa < 700) score += 25;
      else if (cpa < 1500) score += 15;
      else if (cpa < 3000) score += 8;
      else score += 2;
    }
    if (results >= 20) score += 15;
    else if (results >= 5) score += 10;
    else if (results >= 1) score += 5;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreTier(s) {
  if (s >= 75) return { label: "Strong", tone: "good" };
  if (s >= 50) return { label: "Average", tone: "warn" };
  if (s >= 25) return { label: "Weak", tone: "warn" };
  return { label: "Poor", tone: "bad" };
}

export function toneToText(tone) {
  return {
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
  }[tone];
}

export function toneToBg(tone) {
  return {
    good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-50 text-amber-700 ring-amber-200",
    bad: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];
}

export function rollup(nodes, objectiveOverride) {
  const sum = (key) =>
    nodes.reduce((acc, n) => acc + num(ins(n)[key]), 0);
  const sumInt = (key) =>
    nodes.reduce((acc, n) => acc + int(ins(n)[key]), 0);
  const spend = sum("spend");
  const impressions = sumInt("impressions");
  const clicks = sumInt("clicks");
  const reach = sumInt("reach");
  const results = nodes.reduce(
    (acc, n) => acc + getResults(n, objectiveOverride),
    0,
  );
  return {
    spend,
    impressions,
    clicks,
    reach,
    results,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}
