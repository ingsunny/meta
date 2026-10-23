// Pure helpers for working with daily insight rows from Meta. No React.

import { num, int } from "./format";

const findAction = (actions = [], types) => {
  const m = actions.find((a) => types.includes(a.action_type));
  return m ? int(m.value) : 0;
};

// Convert raw Meta daily rows to a uniform shape with derived metrics.
export function normalizeSeries(rows, objective) {
  const objKey = (objective || "").replace("OUTCOME_", "");
  const resultExtractor = {
    LEADS: (acts) => findAction(acts, ["lead"]),
    SALES: (acts) => findAction(acts, ["purchase", "omni_purchase"]),
    ENGAGEMENT: (acts) =>
      findAction(acts, ["post_engagement", "page_engagement"]),
    APP_PROMOTION: (acts) =>
      findAction(acts, ["app_install", "mobile_app_install"]),
  }[objKey];

  return (rows || []).map((r) => {
    const acts = r.actions || [];
    const spend = num(r.spend);
    const impressions = int(r.impressions);
    const clicks = int(r.clicks);
    const reach = int(r.reach);
    const ctr = num(r.ctr);
    const cpc = num(r.cpc);
    const cpm = num(r.cpm);
    const frequency = num(r.frequency);
    const linkClicks = findAction(acts, ["link_click"]);
    const lpv = findAction(acts, [
      "landing_page_view",
      "omni_landing_page_view",
    ]);
    const results = resultExtractor
      ? resultExtractor(acts)
      : objKey === "AWARENESS"
        ? reach
        : clicks;
    const cpl = results > 0 ? spend / results : null;
    return {
      date: r.date_start,
      spend,
      impressions,
      clicks,
      reach,
      ctr,
      cpc,
      cpm,
      frequency,
      linkClicks,
      lpv,
      results,
      cpl,
    };
  });
}

// Sum and re-derive ratios across a contiguous window of normalized rows.
export function aggregateWindow(rows) {
  if (!rows?.length) return null;
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const reach = rows.reduce((s, r) => s + r.reach, 0);
  const linkClicks = rows.reduce((s, r) => s + r.linkClicks, 0);
  const lpv = rows.reduce((s, r) => s + r.lpv, 0);
  const results = rows.reduce((s, r) => s + r.results, 0);
  return {
    days: rows.length,
    spend,
    impressions,
    clicks,
    reach,
    linkClicks,
    lpv,
    results,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpl: results > 0 ? spend / results : null,
  };
}

// Week-over-week delta for any metric, returning {current, previous, delta, pct}.
// "current" = last 7 rows, "previous" = the 7 rows before that.
export function wowDelta(rows, metric) {
  if (rows.length < 8) return null;
  const last7 = rows.slice(-7);
  const prev7 = rows.slice(-14, -7);
  const a = aggregateWindow(last7);
  const b = aggregateWindow(prev7);
  if (!a || !b) return null;
  const cur = a[metric];
  const prev = b[metric];
  if (cur == null || prev == null) return null;
  const delta = cur - prev;
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
  return { current: cur, previous: prev, delta, pct };
}

// Rolling mean + standard deviation. Returns an array same length as rows,
// where index i carries the window stats for rows[i-window..i-1] (exclusive
// of i itself, so we can z-score the current point against its history).
export function rollingStats(rows, metric, window = 7) {
  const out = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i++) {
    if (i < window) continue;
    const slice = rows.slice(i - window, i).map((r) => r[metric] ?? 0);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance =
      slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    out[i] = { mean, sd };
  }
  return out;
}

// Flag days where the metric deviates from its rolling baseline by > threshold
// standard deviations. Returns annotated rows with {anomaly, direction, z}.
export function detectAnomalies(rows, metric, { window = 7, threshold = 2 } = {}) {
  const stats = rollingStats(rows, metric, window);
  return rows.map((r, i) => {
    const s = stats[i];
    const v = r[metric];
    if (!s || v == null || s.sd === 0) return { ...r, anomaly: false };
    const z = (v - s.mean) / s.sd;
    if (Math.abs(z) >= threshold) {
      return {
        ...r,
        anomaly: true,
        z,
        direction: z > 0 ? "spike" : "drop",
        baseline: s.mean,
      };
    }
    return { ...r, anomaly: false };
  });
}
