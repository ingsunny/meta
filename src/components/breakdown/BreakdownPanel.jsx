"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Users,
  UserSquare2,
  MapPin,
  Smartphone,
  Layers,
  Clock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Info,
} from "lucide-react";
import { num, int, fmtNum } from "@/lib/meta/format";
import { useAccount } from "@/components/account/AccountContext";
import { MinimalTooltip } from "@/components/charts/ChartTooltip";
import { getObjKey, getResultLabel } from "@/lib/meta/metrics";
import {
  costMetricName,
  rowPrimaryCost,
  rowResults,
} from "@/lib/meta/audience-insights";

const DIMENSIONS = [
  { key: "age", label: "Age", icon: UserSquare2, rowKey: "age" },
  { key: "gender", label: "Gender", icon: Users, rowKey: "gender" },
  { key: "region", label: "Region", icon: MapPin, rowKey: "region" },
  {
    key: "placement",
    label: "Placement",
    icon: Layers,
    rowKey: null,
    labelOf: (r) => {
      const p = r.publisher_platform || "—";
      const pos = r.platform_position || "";
      return pos ? `${p} · ${pos}` : p;
    },
  },
  { key: "device", label: "Device", icon: Smartphone, rowKey: "impression_device" },
  {
    key: "hour",
    label: "Hour of day",
    icon: Clock,
    rowKey: "hourly_stats_aggregated_by_advertiser_time_zone",
    labelOf: (r) => {
      const raw = r.hourly_stats_aggregated_by_advertiser_time_zone || "";
      const m = raw.match(/^(\d{2}):/);
      return m ? `${m[1]}:00` : raw;
    },
  },
];

// Build the metric set for the table + chart based on objective. Conversion
// objectives get a Results column + cost-per-result column; TRAFFIC and
// AWARENESS only get the cost column since their "result" is already shown
// (clicks for TRAFFIC, impressions for AWARENESS).
function metricsForObjective(objective) {
  const k = getObjKey(objective);
  const base = [
    { key: "spend", label: "Spend", kind: "money" },
    { key: "impressions", label: "Impressions", kind: "int" },
    { key: "clicks", label: "Clicks", kind: "int" },
    { key: "ctr", label: "CTR", kind: "pct" },
  ];
  if (k === "TRAFFIC") {
    base.push({ key: "cost", label: "CPC", kind: "money", derived: true });
  } else if (k === "AWARENESS") {
    base.push({ key: "cost", label: "CPM", kind: "money", derived: true });
  } else {
    base.push({
      key: "results",
      label: getResultLabel(objective),
      kind: "int",
      derived: true,
    });
    base.push({
      key: "cost",
      label: costMetricName(objective),
      kind: "money",
      derived: true,
    });
  }
  return base;
}

function rowLabel(dim, row) {
  if (dim.labelOf) return dim.labelOf(row);
  return row[dim.rowKey] || "—";
}

function valueOf(metric, row, objective) {
  if (metric.derived) {
    if (metric.key === "results") return rowResults(row, objective);
    if (metric.key === "cost") return rowPrimaryCost(row, objective) ?? 0;
  }
  if (metric.kind === "int") return int(row[metric.key]);
  if (metric.kind === "pct") return num(row[metric.key]);
  return num(row[metric.key]);
}

export function BreakdownPanel({ targetId, color = "#1877f2", objective }) {
  const [active, setActive] = useState("age");
  const [chartMetric, setChartMetric] = useState("spend");
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [cache, setCache] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const searchParams = useSearchParams();
  const { accountId, fmtMoney } = useAccount();

  const METRICS = useMemo(() => metricsForObjective(objective), [objective]);

  useEffect(() => {
    setCache({});
  }, [targetId]);

  // Reset chart metric if the new objective doesn't have it (e.g., switching
  // from a LEADS view that selected "results" to a TRAFFIC view that doesn't).
  useEffect(() => {
    if (!METRICS.find((m) => m.key === chartMetric)) {
      setChartMetric("spend");
    }
    if (!METRICS.find((m) => m.key === sortKey)) {
      setSortKey("spend");
      setSortDir("desc");
    }
  }, [METRICS, chartMetric, sortKey]);

  useEffect(() => {
    if (!targetId || cache[active] !== undefined) return;
    let alive = true;
    setLoadingKey(active);
    const qs = new URLSearchParams({ id: targetId, dimension: active });
    const range = searchParams.get("range");
    if (range) qs.set("range", range);
    const since = searchParams.get("since");
    const until = searchParams.get("until");
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    if (accountId) qs.set("account", accountId);

    fetch(`/api/meta/breakdown?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success) setCache((c) => ({ ...c, [active]: j.rows || [] }));
        else setCache((c) => ({ ...c, [active]: "error" }));
      })
      .catch(() => alive && setCache((c) => ({ ...c, [active]: "error" })))
      .finally(() => alive && setLoadingKey(null));
    return () => {
      alive = false;
    };
  }, [targetId, active, accountId, searchParams, cache]);

  const dim = DIMENSIONS.find((d) => d.key === active);
  const chartMetricDef = METRICS.find((m) => m.key === chartMetric) || METRICS[0];
  const sortMetricDef = METRICS.find((m) => m.key === sortKey) || METRICS[0];
  const rows = cache[active];
  const isLoading = loadingKey === active;
  const isError = rows === "error";
  const list = Array.isArray(rows) ? rows : [];

  // Meta hides per-row `actions` data on some breakdowns (most commonly
  // region, hour, device) when slices fall below their privacy threshold.
  // Detect that case — rows exist but no conversion result for any of them
  // — so we can surface a clear notice instead of letting the columns silently
  // read as zeros.
  const noActionsButRowsExist = useMemo(() => {
    const k = getObjKey(objective);
    if (k === "TRAFFIC" || k === "AWARENESS") return false;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    return !rows.some((r) => rowResults(r, objective) > 0);
  }, [rows, objective]);

  const chartData = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({
        name: rowLabel(dim, r),
        value: valueOf(chartMetricDef, r, objective),
        spend: num(r.spend),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [rows, dim, chartMetricDef, objective]);

  const sortedRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    return [...rows]
      .map((r) => ({ raw: r, name: rowLabel(dim, r) }))
      .sort((a, b) => {
        const va = valueOf(sortMetricDef, a.raw, objective);
        const vb = valueOf(sortMetricDef, b.raw, objective);
        return sortDir === "desc" ? vb - va : va - vb;
      })
      .slice(0, 50);
  }, [rows, dim, sortMetricDef, sortDir, objective]);

  const fmt = (v, kind) => {
    if (kind === "money") return fmtMoney(v);
    if (kind === "pct") return `${v.toFixed(2)}%`;
    return fmtNum(v);
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-ink-200 overflow-x-auto">
        {DIMENSIONS.map((d) => {
          const Icon = d.icon;
          const isActive = d.key === active;
          return (
            <button
              key={d.key}
              onClick={() => setActive(d.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-brand-500 text-white"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }`}
            >
              <Icon size={12} />
              {d.label}
            </button>
          );
        })}
        <div className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-ink-100 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setChartMetric(m.key)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors whitespace-nowrap ${
                chartMetric === m.key
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {noActionsButRowsExist && !isLoading && !isError && (
          <div className="mb-3 rounded-lg ring-1 ring-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2.5">
            <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <Info size={11} />
            </span>
            <div className="min-w-0 text-[11.5px] leading-relaxed">
              <p className="font-bold text-ink-900">
                Meta isn't returning per-{dim.label.toLowerCase()}{" "}
                {(getResultLabel(objective) || "result").toLowerCase()}{" "}
                attribution
              </p>
              <p className="text-ink-700 mt-0.5">
                Meta's privacy threshold hides per-slice action data when
                slices fall below their minimum size — this is most common at
                the region (state) level. Spend, Impressions, Clicks, and CTR
                above are accurate. Use{" "}
                <span className="font-semibold text-ink-900">CTR</span> and{" "}
                <span className="font-semibold text-ink-900">click volume</span>{" "}
                as the strongest proxy for which slices are working.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-ink-400 text-xs">
            <div className="h-4 w-4 rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin mr-2" />
            Loading {dim.label.toLowerCase()} breakdown…
          </div>
        )}

        {!isLoading && isError && (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-ink-700">
              Couldn't load this breakdown
            </p>
            <p className="text-[11px] text-ink-500 mt-1">
              Meta may not have data for this dimension on this item, or the
              date range is too narrow.
            </p>
          </div>
        )}

        {!isLoading && !isError && chartData.length === 0 && (
          <div className="py-10 text-center text-sm text-ink-500">
            No {dim.label.toLowerCase()} data for the current range.
          </div>
        )}

        {!isLoading && !isError && chartData.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 26)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
              >
                <CartesianGrid horizontal={false} stroke="#f0f2f5" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#8a8d91" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    chartMetricDef.kind === "pct"
                      ? `${v.toFixed(1)}%`
                      : v >= 1e6
                        ? `${(v / 1e6).toFixed(1)}M`
                        : v >= 1e3
                          ? `${(v / 1e3).toFixed(0)}K`
                          : v
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#1c1e21" }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: "#f0f2f5" }}
                  content={
                    <MinimalTooltip
                      formatter={(v) => fmt(v, chartMetricDef.kind)}
                    />
                  }
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((d, idx) => (
                    <Cell key={idx} fill={color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200">
                    <th className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-500 px-3 py-2">
                      {dim.label}
                    </th>
                    {METRICS.map((m) => (
                      <SortableHeader
                        key={m.key}
                        metric={m}
                        active={sortKey === m.key}
                        dir={sortDir}
                        onClick={() => toggleSort(m.key)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sortedRows.map(({ raw, name }, i) => (
                    <tr key={`${name}-${i}`}>
                      <td className="px-3 py-2 text-ink-800 font-medium">
                        {name}
                      </td>
                      {METRICS.map((m) => {
                        const v = valueOf(m, raw, objective);
                        const display = fmt(v, m.kind);
                        return (
                          <td
                            key={m.key}
                            className={`px-3 py-2 text-right tabular ${
                              sortKey === m.key
                                ? "text-brand-700 font-bold"
                                : "text-ink-700"
                            }`}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-ink-400 text-right">
                Click a column header to sort. Cost column is computed per the
                objective ({sortMetricDef.label.toLowerCase()} =
                {" "}
                {sortMetricDef.derived ? "derived from spend ÷ volume" : "from Meta"}).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortableHeader({ metric, active, dir, onClick }) {
  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th
      onClick={onClick}
      className={`text-right text-[11px] font-bold uppercase tracking-wider px-3 py-2 cursor-pointer select-none transition-colors ${
        active
          ? "text-brand-700"
          : "text-ink-500 hover:text-ink-800"
      }`}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {metric.label}
        <Icon size={10} className={active ? "text-brand-600" : "text-ink-400"} />
      </span>
    </th>
  );
}
