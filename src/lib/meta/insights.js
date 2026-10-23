import { num, int } from "./format";
import {
  ins,
  getScore,
  getResults,
  getObjKey,
  rollup,
  isFatigued,
  MIN_IMPR_FOR_SIGNAL,
} from "./metrics";

export function findTopAndBottom(items, objectiveOverride) {
  const scored = items
    .map((n) => ({ node: n, score: getScore(n, objectiveOverride) }))
    .filter((x) => num(ins(x.node).spend) > 0);
  if (scored.length === 0) return { top: null, bottom: null };
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}

export function buildCallouts(items, objectiveOverride) {
  const callouts = [];
  if (!items?.length) return callouts;

  const totals = rollup(items, objectiveOverride);
  const withSpend = items.filter((n) => num(ins(n).spend) > 0);

  if (withSpend.length >= 2 && totals.spend > 0) {
    const sortedByResults = [...withSpend]
      .map((n) => ({ n, r: getResults(n, objectiveOverride), s: num(ins(n).spend) }))
      .sort((a, b) => b.r - a.r);
    const top = sortedByResults[0];
    const totalResults = sortedByResults.reduce((acc, x) => acc + x.r, 0);
    if (top.r > 0 && totalResults > 0) {
      const share = (top.r / totalResults) * 100;
      const spendShare = (top.s / totals.spend) * 100;
      if (share > 40 && share - spendShare > 5) {
        callouts.push({
          tone: "good",
          text: `${trimName(top.n.name)} drives ${share.toFixed(0)}% of results from just ${spendShare.toFixed(0)}% of spend — consider scaling.`,
        });
      }
    }
  }

  // Only flag fatigue when there's enough delivery for frequency to be meaningful.
  const fatigued = withSpend.filter(isFatigued);
  if (fatigued.length) {
    callouts.push({
      tone: "warn",
      text: `${fatigued.length} ${fatigued.length === 1 ? "item is" : "items are"} showing audience fatigue (frequency > 3.5× over ≥${MIN_IMPR_FOR_SIGNAL.toLocaleString()} impressions).`,
    });
  }

  const zeroResults = withSpend.filter((n) => {
    const r = getResults(n, objectiveOverride);
    const k = getObjKey(n.objective ?? objectiveOverride);
    return r === 0 && num(ins(n).spend) > 500 && k !== "AWARENESS";
  });
  if (zeroResults.length) {
    callouts.push({
      tone: "bad",
      text: `${zeroResults.length} ${zeroResults.length === 1 ? "item has" : "items have"} spend > ₹500 with zero results — review targeting or creatives.`,
    });
  }

  const lowCtr = withSpend.filter(
    (n) => num(ins(n).ctr) < 0.5 && int(ins(n).impressions) >= 5000,
  );
  if (lowCtr.length >= Math.max(2, Math.ceil(withSpend.length * 0.4))) {
    callouts.push({
      tone: "warn",
      text: `Average CTR is low across ${lowCtr.length} items — creative may not be resonating.`,
    });
  }

  return callouts.slice(0, 3);
}

function trimName(s = "", max = 28) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
