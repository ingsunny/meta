// CPL = CPM × 10 / (CTR × CR)   where CTR, CR are in % units
//
// Equivalently in log space:
//   log(CPL) = log(CPM) − log(CTR) − log(CR) + const
// so log(CPL_a/CPL_b) = log(CPM_a/CPM_b) + log(CTR_b/CTR_a) + log(CR_b/CR_a)
//
// Each term cleanly attributes a share of the gap between two items to one
// of the three levers: auction cost, creative relevance, post-click rate.

import { num, int } from "./format";
import { ins, getResults } from "./metrics";

const findAction = (acts = [], types) => {
  const m = acts.find((a) => types.includes(a.action_type));
  return m ? int(m.value) : 0;
};

// Compute the levers for a single node. CR (click→result) and the link-click
// version are both returned; the link-click CR is more diagnostic when ads
// have meaningful link_click vs all-click distinction.
export function decompose(node, objective) {
  const i = ins(node);
  const spend = num(i.spend);
  const impressions = int(i.impressions);
  const clicks = int(i.clicks);
  const linkClicks = findAction(i.actions, ["link_click"]);
  const lpv = findAction(i.actions, [
    "landing_page_view",
    "omni_landing_page_view",
  ]);
  const results = getResults(node, objective);

  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
  const cr = clicks > 0 && results > 0 ? (results / clicks) * 100 : null;
  const linkCr =
    linkClicks > 0 && results > 0 ? (results / linkClicks) * 100 : null;
  const lpRate = clicks > 0 && lpv > 0 ? (lpv / clicks) * 100 : null;
  const formCr =
    lpv > 0 && results > 0 ? (results / lpv) * 100 : null;
  const cpl = results > 0 ? spend / results : null;

  return {
    spend,
    impressions,
    clicks,
    linkClicks,
    lpv,
    results,
    cpm,
    ctr,
    linkCtr,
    cr,
    linkCr,
    lpRate,
    formCr,
    cpl,
  };
}

// Variance attribution: given two decompositions A and B, return how each
// lever contributes to the log-ratio of CPL_a / CPL_b, as a percentage of
// the total log-gap.
export function attributeGap(a, b) {
  if (!a.cpl || !b.cpl || a.cpl === b.cpl) return null;
  const safeLog = (x) => (x > 0 ? Math.log(x) : null);

  const cpmTerm = safeLog(a.cpm) != null && safeLog(b.cpm) != null
    ? safeLog(a.cpm) - safeLog(b.cpm)
    : 0;
  const ctrTerm = safeLog(a.ctr) != null && safeLog(b.ctr) != null
    ? safeLog(b.ctr) - safeLog(a.ctr) // inverse — higher CTR means lower CPL
    : 0;
  const crTerm = a.cr && b.cr ? safeLog(b.cr) - safeLog(a.cr) : 0;
  // Residual catches rounding / data gaps when sub-funnel data is missing.
  const totalLog = Math.log(a.cpl / b.cpl);
  const explained = cpmTerm + ctrTerm + crTerm;
  const residual = totalLog - explained;
  const denom = Math.abs(totalLog) || 1;

  const pct = (x) => Math.round((x / denom) * 100);

  return {
    totalLog,
    parts: [
      { key: "cpm", label: "Auction cost (CPM)", logTerm: cpmTerm, pct: pct(cpmTerm) },
      { key: "ctr", label: "Creative relevance (CTR)", logTerm: ctrTerm, pct: pct(ctrTerm) },
      { key: "cr", label: "Post-click conversion", logTerm: crTerm, pct: pct(crTerm) },
      { key: "other", label: "Other / mix", logTerm: residual, pct: pct(residual) },
    ],
  };
}
