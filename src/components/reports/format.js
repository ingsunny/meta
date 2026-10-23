// Number formatting for report cells and KPIs.

import { isMoney, isPercent } from "@/lib/reports/aggregate";

export function makeFormatter(currency = "USD") {
  let money;
  try {
    money = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
  } catch {
    money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
  const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  return function fmt(col, v, { short = false } = {}) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    if (col.type !== "number") return String(v);
    if (isPercent(col)) return `${dec.format(v)}%`;
    if (isMoney(col)) return short && Math.abs(v) >= 100_000 ? `${money.format(v / 1000).replace(/\.\d+/, "")}K` : money.format(v);
    if (short && Math.abs(v) >= 10_000) return compact.format(v);
    return Number.isInteger(v) ? int.format(v) : dec.format(v);
  };
}

// Strip Meta's verbose suffixes for compact headers/KPI labels.
export function shortLabel(label) {
  return label
    .replace(/\s*\((USD|EUR|GBP|INR|[A-Z]{3})\)/g, "")
    .replace(/\s*\(cost per 1,000 impressions\)/i, "")
    .replace(/\s*\(link click-through rate\)/i, " (link)")
    .trim();
}
