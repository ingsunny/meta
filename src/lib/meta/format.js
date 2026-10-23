export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

export const fmtINR = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

export const fmtINRDec = (n, d = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

export const fmtNum = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

export const fmtCompact = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

export const fmtPct = (n, d = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: d })}%`;
};

export const fmtX = (n, d = 2) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `×${n.toLocaleString("en-IN", { maximumFractionDigits: d })}`;
};

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtDateShort = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "—";

export const RANGE_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  last_7d: "Last 7 days",
  last_14d: "Last 14 days",
  last_28d: "Last 28 days",
  last_30d: "Last 30 days",
  last_90d: "Last 90 days",
  maximum: "Lifetime",
};
