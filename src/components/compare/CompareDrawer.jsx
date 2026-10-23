"use client";

import { useEffect, useState } from "react";
import { X, BarChart3, Users2, Layers, Activity } from "lucide-react";
import {
  TargetingPanel,
  targetingSummary,
} from "@/components/targeting/TargetingPanel";
import { BreakdownPanel } from "@/components/breakdown/BreakdownPanel";
import { WhyOneWins } from "@/components/decomposition/WhyOneWins";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ins,
  getResults,
  getScore,
  getPrimaryKPI,
  scoreTier,
  toneToText,
} from "@/lib/meta/metrics";
import { num, int, fmtNum, fmtPct, fmtX } from "@/lib/meta/format";
import { useAccount } from "@/components/account/AccountContext";
import { MinimalTooltip } from "@/components/charts/ChartTooltip";

export const SERIES_COLORS = ["#1877f2", "#f7b928", "#8b5cf6"];

export function CompareDrawer({
  open,
  onClose,
  items,
  objectiveOverride,
  onRemove,
  title = "Comparison",
  itemKindLabel = "items",
}) {
  const { fmtMoney, currency } = useAccount();
  const [tab, setTab] = useState("performance");

  useEffect(() => {
    if (!open) return;
    setTab("performance");
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const normalize = (val, max, invert = false) => {
    const n = Math.min(100, (val / max) * 100);
    return Math.max(0, Math.round(invert ? 100 - n : n));
  };

  const radarData = [
    {
      metric: "CTR",
      ...Object.fromEntries(
        items.map((c) => [c.id, normalize(num(ins(c).ctr), 7)]),
      ),
    },
    {
      metric: "Cost Eff.",
      ...Object.fromEntries(
        items.map((c) => [
          c.id,
          num(ins(c).cpc) > 0 ? normalize(num(ins(c).cpc), 50, true) : 0,
        ]),
      ),
    },
    {
      metric: "Reach",
      ...Object.fromEntries(
        items.map((c) => [c.id, normalize(int(ins(c).reach), 400000)]),
      ),
    },
    {
      metric: "Results",
      ...Object.fromEntries(
        items.map((c) => [
          c.id,
          Math.min(100, Math.round(getResults(c, objectiveOverride) / 5)),
        ]),
      ),
    },
    {
      metric: "Freshness",
      ...Object.fromEntries(
        items.map((c) => [c.id, normalize(num(ins(c).frequency), 8, true)]),
      ),
    },
    {
      metric: "Score",
      ...Object.fromEntries(
        items.map((c) => [c.id, getScore(c, objectiveOverride)]),
      ),
    },
  ];

  const absoluteData = [
    {
      name: "Spend",
      ...Object.fromEntries(
        items.map((c) => [c.id, Math.round(num(ins(c).spend))]),
      ),
    },
    {
      name: "Reach",
      ...Object.fromEntries(items.map((c) => [c.id, int(ins(c).reach)])),
    },
    {
      name: "Clicks",
      ...Object.fromEntries(items.map((c) => [c.id, int(ins(c).clicks)])),
    },
    {
      name: "Results",
      ...Object.fromEntries(
        items.map((c) => [c.id, getResults(c, objectiveOverride)]),
      ),
    },
  ];

  const rows = [
    {
      label: "Score",
      fn: (c) => {
        const s = getScore(c, objectiveOverride);
        const { tone } = scoreTier(s);
        return { val: `${s}`, tone };
      },
    },
    {
      label: `Spend · ${currency}`,
      fn: (c) => ({ val: fmtMoney(num(ins(c).spend)) }),
    },
    { label: "Reach", fn: (c) => ({ val: fmtNum(int(ins(c).reach)) }) },
    {
      label: "Impressions",
      fn: (c) => ({ val: fmtNum(int(ins(c).impressions)) }),
    },
    { label: "Clicks", fn: (c) => ({ val: fmtNum(int(ins(c).clicks)) }) },
    {
      label: "CTR",
      fn: (c) => ({
        val: fmtPct(num(ins(c).ctr)),
        tone: num(ins(c).ctr) > 2 ? "good" : undefined,
      }),
    },
    { label: "CPM", fn: (c) => ({ val: fmtMoney(num(ins(c).cpm)) }) },
    { label: "CPC", fn: (c) => ({ val: fmtMoney(num(ins(c).cpc)) }) },
    {
      label: "KPI",
      fn: (c) => {
        const k = getPrimaryKPI(c, objectiveOverride);
        return {
          val:
            k.raw != null
              ? `${k.label} · ${fmtMoney(k.raw)}`
              : `${k.label} · —`,
        };
      },
    },
    {
      label: "Results",
      fn: (c) => ({ val: fmtNum(getResults(c, objectiveOverride)) }),
    },
    {
      label: "Frequency",
      fn: (c) => {
        const f = num(ins(c).frequency);
        return {
          val: fmtX(f),
          tone: f > 4 ? "bad" : f > 3 ? "warn" : undefined,
        };
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm animate-in fade-in duration-150"
      />
      <div className="relative ml-auto h-full w-full max-w-300 overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right-4 duration-200">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-ink-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-ink-900">{title}</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {items.length} {itemKindLabel} selected
              </p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <CompareTabs tab={tab} setTab={setTab} items={items} />
        </header>

        <div className="px-6 py-6 space-y-6">
          <div
            className={`grid gap-3 ${items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
            key="legend"
          >
            {items.map((c, idx) => (
              <div
                key={c.id}
                className="surface px-4 py-3"
                style={{
                  boxShadow: `inset 0 0 0 2px ${SERIES_COLORS[idx]}1a, var(--shadow-card)`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-2 w-8 rounded-full"
                    style={{ background: SERIES_COLORS[idx] }}
                  />
                  <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">
                    Series {idx + 1}
                  </span>
                </div>
                <p className="text-[13px] font-bold text-ink-900 line-clamp-2 leading-snug">
                  {c.name}
                </p>
                {onRemove && (
                  <button
                    onClick={() => onRemove(c.id)}
                    className="mt-2 text-[11px] font-semibold text-ink-500 hover:text-rose-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {tab === "performance" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartFrame
                  title="Performance profile"
                  sub="Normalized 0–100, higher is better"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart
                      data={radarData}
                      margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
                    >
                      <PolarGrid stroke="#e5e3df" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 11, fill: "#6b6864" }}
                      />
                      <PolarRadiusAxis
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      {items.map((c, idx) => (
                        <Radar
                          key={c.id}
                          name={c.name}
                          dataKey={c.id}
                          stroke={SERIES_COLORS[idx]}
                          fill={SERIES_COLORS[idx]}
                          fillOpacity={0.1}
                          strokeWidth={1.75}
                          dot={false}
                        />
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartFrame>

                <ChartFrame title="Absolute volume" sub="Side-by-side totals">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={absoluteData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f0ee"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#9a9690" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#9a9690" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v >= 1e6
                            ? `${(v / 1e6).toFixed(1)}M`
                            : v >= 1e3
                              ? `${(v / 1e3).toFixed(0)}K`
                              : v
                        }
                      />
                      <Tooltip
                        cursor={{ fill: "#f8f8f7" }}
                        content={
                          <MinimalTooltip
                            formatter={(v) => v.toLocaleString("en-IN")}
                          />
                        }
                      />
                      {items.map((c, idx) => (
                        <Bar
                          key={c.id}
                          dataKey={c.id}
                          name={c.name}
                          fill={SERIES_COLORS[idx]}
                          radius={[3, 3, 0, 0]}
                          barSize={18}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>

              <div className="rounded-xl ring-1 ring-ink-200/60 overflow-hidden">
                <div className="border-b border-ink-100 px-5 py-3">
                  <h3 className="text-sm font-semibold text-ink-800">
                    Full metrics
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-50/60">
                      <th className="text-left text-[11px] font-medium uppercase tracking-wider text-ink-400 px-5 py-2.5">
                        Metric
                      </th>
                      {items.map((c, idx) => (
                        <th
                          key={c.id}
                          className="text-right text-[11px] font-medium text-ink-600 px-5 py-2.5"
                        >
                          <span className="inline-flex items-center gap-2 justify-end">
                            <span
                              className="h-2 w-2 rounded-sm"
                              style={{ background: SERIES_COLORS[idx] }}
                            />
                            <span className="truncate max-w-56">{c.name}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <td className="text-ink-500 px-5 py-2.5 text-xs">
                          {row.label}
                        </td>
                        {items.map((c) => {
                          const r = row.fn(c);
                          const color = r.tone
                            ? toneToText(r.tone)
                            : "text-ink-800";
                          return (
                            <td
                              key={c.id}
                              className={`text-right tabular font-semibold px-5 py-2.5 ${color}`}
                            >
                              {r.val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "why" && items.length === 2 && (
            <WhyOneWins
              a={items[0]}
              b={items[1]}
              objective={objectiveOverride ?? items[0].objective}
            />
          )}

          {tab === "targeting" && <TargetingCompare items={items} />}

          {tab === "breakdowns" && (
            <BreakdownCompare
              items={items}
              objective={objectiveOverride ?? items[0]?.objective}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CompareTabs({ tab, setTab, items }) {
  const allHaveTargeting = items.every((it) => it.targeting);
  const tabs = [{ key: "performance", label: "Performance", icon: BarChart3 }];
  if (items.length === 2) {
    tabs.push({ key: "why", label: "Why one wins", icon: Activity });
  }
  if (allHaveTargeting) {
    tabs.push({ key: "targeting", label: "Targeting", icon: Users2 });
  }
  tabs.push({ key: "breakdowns", label: "Audience breakdowns", icon: Layers });
  return (
    <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = tab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
              isActive
                ? "bg-brand-50 text-brand-700"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            <Icon size={12} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function TargetingCompare({ items }) {
  const allHaveTargeting = items.every((it) => it.targeting);
  if (!allHaveTargeting) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-700 font-semibold">
          Targeting isn't available at this level
        </p>
        <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
          Targeting is set at the ad-set level. To compare audiences, open a
          campaign and select two ad sets to compare.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
      >
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="rounded-xl bg-ink-50/60 p-3"
            style={{
              boxShadow: `inset 0 0 0 2px ${SERIES_COLORS[idx]}1a`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="h-2 w-6 rounded-full"
                style={{ background: SERIES_COLORS[idx] }}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Series {idx + 1}
              </span>
            </div>
            <p className="text-[13px] font-bold text-ink-900 line-clamp-2 leading-snug mb-2">
              {it.name}
            </p>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              {targetingSummary(it.targeting)}
            </p>
          </div>
        ))}
      </div>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((it) => (
          <div key={it.id} className="min-w-0">
            <TargetingPanel targeting={it.targeting} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownCompare({ items, objective }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">
        Same dimension, side by side. Switch the dimension/metric on any panel —
        each loads from Meta independently so you can pinpoint where one item
        wins or loses against another.
      </p>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((it, idx) => (
          <div key={it.id} className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-6 rounded-full"
                style={{ background: SERIES_COLORS[idx] }}
              />
              <p className="text-xs font-bold text-ink-900 truncate">
                {it.name}
              </p>
            </div>
            <BreakdownPanel
              targetId={it.id}
              color={SERIES_COLORS[idx]}
              objective={objective ?? it.objective}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartFrame({ title, sub, children }) {
  return (
    <div className="rounded-xl ring-1 ring-ink-200/60 p-4 bg-white">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        {sub && <p className="text-[11px] text-ink-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
