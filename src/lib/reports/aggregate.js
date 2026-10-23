// Client-safe aggregation for report tables. Groups rows by a dimension and
// rolls metrics up correctly: additive columns are summed; well-known
// ratios (CTR, CPM, CPC, cost per result, frequency, ROAS) are recomputed
// from their summed parts; any other ratio falls back to a plain mean.

export function currencyOf(columns) {
  const spend = columns.find((c) => c.role === "spend");
  const m = spend?.label.match(/\(([A-Z]{3})\)/);
  return m ? m[1] : "USD";
}

export function isMoney(col) {
  const l = col.label.toLowerCase();
  return col.type === "number" && (col.role === "spend" || col.role === "revenue" || /(amount spent|cost|cpm|cpc|cpa|spend|value|revenue|budget)/.test(l)) && !/roas|rate|ctr/.test(l);
}

export function isPercent(col) {
  const l = col.label.toLowerCase();
  return col.type === "number" && /(ctr|rate|%|percentage)/.test(l);
}

function roleIndex(columns) {
  const idx = {};
  columns.forEach((c, i) => {
    if (c.role && idx[c.role] === undefined) idx[c.role] = i;
  });
  return idx;
}

// Build a function (sums) → derived value for a ratio column, if we know
// its formula and the parts exist in this file.
function deriver(col, idx) {
  const l = col.label.toLowerCase();
  const has = (r) => idx[r] !== undefined;
  const clicksRole = /\(all\)/.test(l) ? "clicks" : has("link_clicks") ? "link_clicks" : "clicks";
  const div = (a, b, k = 1) => (s) => (s[b] ? (s[a] / s[b]) * k : null);
  if (/cpm/.test(l) && has("spend") && has("impressions")) return div("spend", "impressions", 1000);
  if (/cost per result/.test(l) && has("spend") && has("results")) return div("spend", "results");
  if (/cost per lead/.test(l) && has("spend") && has("leads")) return div("spend", "leads");
  if (/cost per purchase/.test(l) && has("spend") && has("purchases")) return div("spend", "purchases");
  if (/ctr/.test(l) && has(clicksRole) && has("impressions")) return div(clicksRole, "impressions", 100);
  if (/cpc/.test(l) && has("spend") && has(clicksRole)) return div("spend", clicksRole);
  if (/frequency/.test(l) && has("impressions") && has("reach")) return div("impressions", "reach");
  if (/(roas|return on ad spend)/.test(l) && has("revenue") && has("spend")) return div("revenue", "spend");
  return null;
}

// groupKey: column key, or null for a single "All rows" total.
export function aggregate(columns, rows, groupKey = null) {
  const idx = roleIndex(columns);
  const gi = groupKey ? columns.findIndex((c) => c.key === groupKey) : -1;
  const metricCols = columns.map((c, i) => [c, i]).filter(([c]) => c.type === "number");
  const derivers = Object.fromEntries(metricCols.map(([c]) => [c.key, c.agg === "avg" ? deriver(c, idx) : null]));

  const groups = new Map();
  for (const r of rows) {
    const label = gi >= 0 ? (r[gi] === null || r[gi] === "" ? "(blank)" : String(r[gi])) : "All rows";
    let g = groups.get(label);
    if (!g) {
      g = { label, count: 0, sums: {}, n: {} };
      groups.set(label, g);
    }
    g.count++;
    for (const [c, i] of metricCols) {
      const v = r[i];
      if (v === null || v === undefined) continue;
      g.sums[c.key] = (g.sums[c.key] || 0) + v;
      g.n[c.key] = (g.n[c.key] || 0) + 1;
    }
  }

  return [...groups.values()].map((g) => {
    // Role-keyed sums feed the derivers.
    const roleSums = {};
    for (const [role, i] of Object.entries(idx)) roleSums[role] = g.sums[columns[i].key] || 0;
    const values = {};
    for (const [c] of metricCols) {
      if (c.agg === "sum") values[c.key] = g.sums[c.key] ?? null;
      else if (derivers[c.key]) values[c.key] = derivers[c.key](roleSums);
      else values[c.key] = g.n[c.key] ? g.sums[c.key] / g.n[c.key] : null;
    }
    return { label: g.label, count: g.count, values };
  });
}

export function totals(columns, rows) {
  return aggregate(columns, rows, null)[0] || { label: "All rows", count: 0, values: {} };
}

// Daily series for one metric over the first date column.
export function series(columns, rows, metricKey) {
  const dateCol = columns.find((c) => c.type === "date" && c.role !== "date_end");
  if (!dateCol) return [];
  return aggregate(columns, rows, dateCol.key)
    .filter((g) => g.label !== "(blank)")
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((g) => ({ date: g.label, value: g.values[metricKey] ?? 0 }));
}

// KPI picks: known roles first, in a sensible order; generic files fall
// back to their first few additive metrics.
const KPI_ORDER = [
  ["spend", /amount spent|spend|cost$/],
  ["results", null],
  ["cpr", /^cost per result/],
  ["revenue", null],
  ["roas", /roas|return on ad spend/],
  ["impressions", null],
  ["link_clicks", null],
  ["ctr", /^ctr/],
  ["cpm", /^cpm/],
  ["reach", null],
];

export function pickKpis(columns, max = 6) {
  const nums = columns.filter((c) => c.type === "number");
  const picked = [];
  for (const [role, re] of KPI_ORDER) {
    const col = nums.find((c) => c.role === role) || (re && nums.find((c) => re.test(c.label.toLowerCase())));
    if (col && !picked.includes(col)) picked.push(col);
    if (picked.length >= max) break;
  }
  if (picked.length < 3) {
    for (const c of nums) {
      if (!picked.includes(c)) picked.push(c);
      if (picked.length >= max) break;
    }
  }
  return picked;
}

export function toCsv(headers, matrix) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...matrix].map((r) => r.map(esc).join(",")).join("\n");
}
