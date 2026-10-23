"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import {
  normalizeSeries,
  wowDelta,
  detectAnomalies,
} from "@/lib/meta/timeseries";
import { num, fmtNum, fmtPct, fmtX } from "@/lib/meta/format";
import { useAccount } from "@/components/account/AccountContext";
import { MinimalTooltip } from "@/components/charts/ChartTooltip";

const METRICS = [
  { key: "spend", label: "Spend", kind: "money", color: "#1877f2" },
  { key: "results", label: "Results", kind: "int", color: "#10b981" },
  { key: "cpl", label: "Cost per result", kind: "money", color: "#8b5cf6" },
  { key: "ctr", label: "CTR", kind: "pct", color: "#f59e0b" },
  { key: "cpm", label: "CPM", kind: "money", color: "#06b6d4" },
  { key: "frequency", label: "Frequency", kind: "x", color: "#e02d3c" },
];

// Which direction is "good" — used to color WoW deltas.
const LOWER_IS_BETTER = new Set(["cpl", "cpm", "cpc", "frequency"]);

export function TrendsPanel({ targetId, objective }) {
  const searchParams = useSearchParams();
  const { accountId, fmtMoney } = useAccount();
  const [active, setActive] = useState("spend");
  const [state, setState] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    if (!targetId) return;
    let alive = true;
    setState({ status: "loading", rows: [] });
    const qs = new URLSearchParams({ id: targetId });
    const range = searchParams.get("range");
    if (range) qs.set("range", range);
    const since = searchParams.get("since");
    const until = searchParams.get("until");
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    if (accountId) qs.set("account", accountId);

    fetch(`/api/meta/timeseries?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success) setState({ status: "ok", rows: j.rows || [] });
        else setState({ status: "error", rows: [] });
      })
      .catch(() => alive && setState({ status: "error", rows: [] }));
    return () => {
      alive = false;
    };
  }, [targetId, accountId, searchParams]);

  const normalized = useMemo(
    () => normalizeSeries(state.rows, objective),
    [state.rows, objective],
  );

  const annotated = useMemo(
    () => detectAnomalies(normalized, active, { window: 7, threshold: 2 }),
    [normalized, active],
  );

  const activeDef = METRICS.find((m) => m.key === active) || METRICS[0];
  const deltas = useMemo(() => {
    const out = {};
    METRICS.forEach((m) => {
      out[m.key] = wowDelta(normalized, m.key);
    });
    return out;
  }, [normalized]);

  const fmt = (kind, v) => {
    if (v == null || !Number.isFinite(v)) return "—";
    if (kind === "money") return fmtMoney(v);
    if (kind === "pct") return fmtPct(v);
    if (kind === "x") return fmtX(v);
    return fmtNum(v);
  };

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const enoughData = normalized.length >= 2;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {METRICS.map((m) => {
          const isActive = m.key === active;
          const delta = deltas[m.key];
          const lowerBetter = LOWER_IS_BETTER.has(m.key);
          const arrowTone =
            delta?.pct == null
              ? "neutral"
              : delta.pct === 0
                ? "neutral"
                : (delta.pct > 0) === lowerBetter
                  ? "bad"
                  : "good";
          return (
            <button
              key={m.key}
              onClick={() => setActive(m.key)}
              className={`text-left rounded-xl px-3 py-2.5 transition-all ${
                isActive
                  ? "bg-brand-50 ring-2 ring-brand-500"
                  : "bg-ink-50/60 ring-1 ring-ink-200/60 hover:bg-ink-100"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                {m.label}
              </p>
              <p
                className={`mt-1 text-base font-bold tabular leading-tight ${isActive ? "text-brand-700" : "text-ink-900"}`}
              >
                {delta
                  ? fmt(m.kind, delta.current)
                  : enoughData
                    ? "—"
                    : "—"}
              </p>
              {delta?.pct != null && (
                <p
                  className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${
                    arrowTone === "good"
                      ? "text-emerald-700"
                      : arrowTone === "bad"
                        ? "text-rose-700"
                        : "text-ink-500"
                  }`}
                >
                  {delta.pct > 0 ? (
                    <TrendingUp size={11} strokeWidth={2.5} />
                  ) : delta.pct < 0 ? (
                    <TrendingDown size={11} strokeWidth={2.5} />
                  ) : (
                    <Minus size={11} />
                  )}
                  {Math.abs(delta.pct).toFixed(1)}% WoW
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="surface p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-ink-400 text-xs">
            <div className="h-4 w-4 rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin mr-2" />
            Loading daily history…
          </div>
        )}

        {!isLoading && isError && (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-ink-700">
              Couldn't load trends
            </p>
            <p className="text-[11px] text-ink-500 mt-1">
              Meta didn't return daily data for this item.
            </p>
          </div>
        )}

        {!isLoading && !isError && !enoughData && (
          <div className="py-10 text-center text-sm text-ink-500">
            Not enough days of data yet for a trend view.
          </div>
        )}

        {!isLoading && !isError && enoughData && (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={annotated}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f0f2f5"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#8a8d91" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(d) => d?.slice(5) || ""}
                  interval="preserveStartEnd"
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#8a8d91" }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                  tickFormatter={(v) => {
                    if (activeDef.kind === "money") {
                      return v >= 1e6
                        ? `${(v / 1e6).toFixed(1)}M`
                        : v >= 1e3
                          ? `${(v / 1e3).toFixed(0)}K`
                          : v;
                    }
                    if (activeDef.kind === "pct") return `${v.toFixed(1)}%`;
                    if (activeDef.kind === "x") return `${v.toFixed(1)}×`;
                    return v >= 1e6
                      ? `${(v / 1e6).toFixed(1)}M`
                      : v >= 1e3
                        ? `${(v / 1e3).toFixed(0)}K`
                        : v;
                  }}
                />
                <Tooltip
                  cursor={{
                    stroke: activeDef.color,
                    strokeDasharray: "2 2",
                    strokeOpacity: 0.4,
                  }}
                  content={
                    <MinimalTooltip
                      formatter={(v) => fmt(activeDef.kind, v)}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey={active}
                  stroke={activeDef.color}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload, index } = props;
                    if (payload?.anomaly) {
                      return (
                        <circle
                          key={index}
                          cx={cx}
                          cy={cy}
                          r={4.5}
                          fill={
                            payload.direction === "spike"
                              ? "#e02d3c"
                              : "#f59e0b"
                          }
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <Dot key={index} cx={cx} cy={cy} r={0} />;
                  }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>

            <AnomalyList
              rows={annotated}
              metric={activeDef}
              fmt={fmt}
              lowerBetter={LOWER_IS_BETTER.has(active)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AnomalyList({ rows, metric, fmt, lowerBetter }) {
  const anomalies = rows
    .filter((r) => r.anomaly)
    .slice(-6)
    .reverse();
  if (anomalies.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">
        Statistical anomalies (≥2σ from 7-day baseline)
      </p>
      <ul className="space-y-1.5">
        {anomalies.map((a, i) => {
          const isBad = (a.direction === "spike") === lowerBetter;
          return (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[12px] leading-relaxed"
            >
              <AlertCircle
                size={12}
                className={`mt-0.5 shrink-0 ${
                  isBad ? "text-rose-600" : "text-amber-600"
                }`}
              />
              <span className="text-ink-700">
                <span className="font-semibold tabular text-ink-900">
                  {a.date}
                </span>
                {" — "}
                {metric.label.toLowerCase()}{" "}
                <span className="font-semibold">
                  {a.direction === "spike" ? "spiked" : "dropped"}
                </span>{" "}
                to {fmt(metric.kind, a[metric.key])} vs baseline{" "}
                {fmt(metric.kind, a.baseline)}{" "}
                <span className="text-ink-400">
                  ({a.z > 0 ? "+" : ""}
                  {a.z.toFixed(1)}σ)
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
