// Rule-based diagnostic alerts. Pure functions over the data we already
// have — no extra API calls. Every alert has a severity, a code (for stable
// references), a one-line title, a plain-English message, and a suggested
// action. Surfaces in:
//   - L1 banner (account-wide rolled-up)
//   - row chips (top alert per row)
//   - DetailDrawer Overview tab (full list)
//   - Excel report Recommendations sheet

import { num, int } from "./format";
import {
  ins,
  getScore,
  getResults,
  getObjKey,
  isFatigued,
  MIN_IMPR_FOR_SIGNAL,
} from "./metrics";
import { isDelivering } from "./status";

// Severity order: bad > warn > info > good
const SEV = { bad: 3, warn: 2, info: 1, good: 0 };

export function compareSeverity(a, b) {
  return SEV[b] - SEV[a];
}

// Generate alerts for a single node, given context about its peers (used
// for relative checks like "this adset is the cost outlier in its campaign").
export function auditNode(node, { peers = [], objective, accountCurrency } = {}) {
  const alerts = [];
  if (!node) return alerts;

  const i = ins(node);
  const obj = objective ?? node.objective;
  const objKey = getObjKey(obj);
  const spend = num(i.spend);
  const impressions = int(i.impressions);
  const clicks = int(i.clicks);
  const reach = int(i.reach);
  const freq = num(i.frequency);
  const ctr = num(i.ctr);
  const results = getResults(node, obj);
  const delivering = isDelivering(node);

  // ── Hard signals (BAD) ───────────────────────────────────────────────────
  if (delivering && spend > 0 && clicks === 0 && impressions > 200) {
    alerts.push({
      severity: "bad",
      code: "spend_no_clicks",
      title: "Spending without clicks",
      message: `${impressions.toLocaleString()} impressions and zero clicks — delivery is broken (creative disapproved, bad targeting, or wrong placement).`,
      action: "Check creative approval status and audience definition immediately.",
    });
  }

  if (objKey !== "AWARENESS" && spend > 500 && results === 0) {
    alerts.push({
      severity: "bad",
      code: "spend_no_results",
      title: "Burning spend with no conversions",
      message: `${accountCurrency || "₹"}${Math.round(spend).toLocaleString()} spent, 0 results. Likely a pixel/conversion event misconfiguration, an LP issue, or off-target audience.`,
      action: "Verify the conversion event fires and review the audience definition.",
    });
  }

  // ── Watch signals (WARN) ─────────────────────────────────────────────────
  if (isFatigued(node)) {
    alerts.push({
      severity: "warn",
      code: "fatigue",
      title: `Audience fatigue (×${freq.toFixed(1)})`,
      message: `Average viewer has seen this ${freq.toFixed(1)} times over ${impressions.toLocaleString()} impressions. CTR typically declines past 3.5×.`,
      action: "Refresh creative or expand the audience.",
    });
  }

  if (impressions >= 5000 && ctr > 0 && ctr < 0.5) {
    alerts.push({
      severity: "warn",
      code: "low_ctr",
      title: `Low CTR (${ctr.toFixed(2)}%)`,
      message: `CTR below 0.5% over ${impressions.toLocaleString()} impressions usually means creative or hook isn't landing.`,
      action: "Test a new opening line, image, or thumbnail.",
    });
  }

  // Relative checks against peers (same parent)
  if (peers.length >= 3) {
    const peerSpend = peers.reduce((s, p) => s + num(ins(p).spend), 0);
    const peerResults = peers.reduce(
      (s, p) => s + getResults(p, obj),
      0,
    );
    if (peerSpend > 0 && peerResults > 0) {
      const myShareSpend = spend / peerSpend;
      const myShareResults = results / peerResults;
      // Top performer: small spend share, big results share → SCALE
      if (myShareSpend < 0.3 && myShareResults > 0.5 && spend > 0 && results > 0) {
        alerts.push({
          severity: "good",
          code: "underbudgeted_winner",
          title: "Underfunded winner",
          message: `Takes ${(myShareSpend * 100).toFixed(0)}% of the spend but drives ${(myShareResults * 100).toFixed(0)}% of results. Marginal cost is below average.`,
          action: "Increase budget gradually (≤20%/change).",
        });
      }
      // Cost outlier: my CPL > 2× peer average
      const myCpl = results > 0 ? spend / results : null;
      const peerCpl = peerResults > 0 ? peerSpend / peerResults : null;
      if (myCpl != null && peerCpl != null && myCpl > peerCpl * 2 && spend > 500) {
        alerts.push({
          severity: "warn",
          code: "cpl_outlier",
          title: "Cost outlier",
          message: `Cost per result is ${(myCpl / peerCpl).toFixed(1)}× the campaign average. Other items are converting cheaper.`,
          action: "Investigate or shift budget to better performers.",
        });
      }
    }
  }

  // ── Info / good signals ──────────────────────────────────────────────────
  if (delivering && impressions < MIN_IMPR_FOR_SIGNAL) {
    alerts.push({
      severity: "info",
      code: "learning",
      title: "Still learning",
      message: `Only ${impressions.toLocaleString()} impressions so far. Wait for ≥${MIN_IMPR_FOR_SIGNAL.toLocaleString()} before drawing conclusions.`,
      action: "Don't optimize yet — let the auction stabilize.",
    });
  }

  if (delivering && spend === 0 && reach === 0) {
    alerts.push({
      severity: "warn",
      code: "not_delivering",
      title: "Active but not delivering",
      message:
        "Marked active in Meta but no spend and no reach — audience may be too narrow, schedule may not be active, or creatives may be pending review.",
      action: "Check audience size, schedule, and creative approval.",
    });
  }

  return alerts.sort(compareSeverity);
}

// Aggregate alerts across a list of items, returning the top N most-impactful
// account-wide signals (de-duplicated by code).
export function aggregateAccountAlerts(items, objective) {
  const buckets = new Map(); // code -> {count, severity, exampleNames[]}
  items.forEach((it) => {
    const list = auditNode(it, { peers: items, objective: it.objective ?? objective });
    list.forEach((a) => {
      if (a.severity === "good" || a.severity === "info") return;
      const cur = buckets.get(a.code) || {
        code: a.code,
        severity: a.severity,
        title: a.title.replace(/\s*\([^)]+\)$/, ""), // strip per-instance qualifiers
        count: 0,
        examples: [],
      };
      cur.count += 1;
      if (cur.examples.length < 3) cur.examples.push(it.name);
      buckets.set(a.code, cur);
    });
  });
  return Array.from(buckets.values())
    .sort((a, b) => SEV[b.severity] - SEV[a.severity] || b.count - a.count)
    .slice(0, 6);
}

// Highest-priority single alert per node (for row chip display).
export function topAlert(node, ctx) {
  const list = auditNode(node, ctx);
  if (!list.length) return null;
  // Skip info-level for row chips — they're noisy
  return list.find((a) => a.severity !== "info") || null;
}

// ── Today's priorities ─────────────────────────────────────────────────────
// Per-item prioritized queue: each entry is one specific campaign × its top
// actionable alert (bad / warn / good — info skipped because not actionable),
// ranked by impact = severity weight × spend at stake. The result is a
// "what should I look at first?" list that compresses the daily morning
// triage across the whole account.

const SEV_WEIGHT = { bad: 100, warn: 30, good: 20 };

export function buildPriorityQueue(items, objective, limit = 12) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  items.forEach((it) => {
    const list = auditNode(it, {
      peers: items,
      objective: it.objective ?? objective,
    });
    // Pick the highest-severity actionable alert for this node.
    const top = list.find((a) => a.severity !== "info");
    if (!top) return;
    const spend = num(ins(it).spend);
    // Floor of 100 so a "bad" on a tiny-spend item still ranks above warn on
    // a huge-spend item — severity dominates, spend breaks ties of same kind.
    const impact = (SEV_WEIGHT[top.severity] || 0) * Math.max(spend, 100);
    out.push({
      id: it.id,
      name: it.name,
      objective: it.objective ?? objective,
      severity: top.severity,
      alert: top,
      spend,
      impact,
    });
  });
  return out.sort((a, b) => b.impact - a.impact).slice(0, limit);
}
