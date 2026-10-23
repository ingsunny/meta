"use client";

import { useEffect, useState } from "react";
import {
  X,
  BarChart3,
  Users2,
  Layers,
  Film,
  LineChart as LineIcon,
  Rocket,
} from "lucide-react";
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
  Cell,
} from "recharts";
import {
  ins,
  getResults,
  getResultLabel,
  getScore,
  getPrimaryKPI,
  getObjConfig,
  scoreTier,
  toneToText,
  isFatigued,
} from "@/lib/meta/metrics";
import { num, int, fmtNum, fmtPct, fmtX, fmtDate } from "@/lib/meta/format";
import {
  ScoreBadge,
  StatusPill,
  ObjectiveTag,
} from "@/components/metrics/ScoreBadge";
import { Avatar } from "@/components/metrics/Avatar";
import { MinimalTooltip } from "@/components/charts/ChartTooltip";
import { useAccount } from "@/components/account/AccountContext";
import { CreativePreview } from "@/components/preview/CreativePreview";
import { TargetingPanel } from "@/components/targeting/TargetingPanel";
import { BreakdownPanel } from "@/components/breakdown/BreakdownPanel";
import { TrendsPanel } from "@/components/trends/TrendsPanel";
import { DecompositionCard } from "@/components/decomposition/DecompositionCard";
import { FunnelChart } from "@/components/funnel/FunnelChart";
import { AlertsList } from "@/components/alerts/AlertsBanner";
import { auditNode } from "@/lib/meta/alerts";
import { ScalePanel } from "@/components/scale/ScalePanel";

export function DetailDrawer({
  open,
  onClose,
  item,
  kind = "campaign",
  objectiveOverride,
}) {
  const { fmtMoney, currency } = useAccount();
  const [tab, setTab] = useState("scale");

  useEffect(() => {
    if (!open) return;
    setTab("scale");
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, item?.id]);

  if (!open || !item) return null;

  const i = ins(item);
  const objective = objectiveOverride ?? item.objective;
  const objConf = getObjConfig(objective);
  const score = getScore(item, objective);
  const kpi = getPrimaryKPI(item, objective);
  const results = getResults(item, objective);
  const fatigued = isFatigued(item);
  const tier = scoreTier(score);

  const metrics = [
    {
      label: kpi.label,
      value: kpi.raw != null ? fmtMoney(kpi.raw) : "—",
      highlight: true,
    },
    { label: getResultLabel(objective), value: fmtNum(results) },
    { label: `Spend · ${currency}`, value: fmtMoney(num(i.spend)) },
    { label: "Reach", value: fmtNum(int(i.reach)) },
    { label: "Impressions", value: fmtNum(int(i.impressions)) },
    { label: "Clicks", value: fmtNum(int(i.clicks)) },
    { label: "CTR", value: fmtPct(num(i.ctr)) },
    { label: "CPM", value: fmtMoney(num(i.cpm)) },
    { label: "CPC", value: fmtMoney(num(i.cpc)) },
    {
      label: "Frequency",
      value: fmtX(num(i.frequency)),
      tone: fatigued ? "warn" : null,
    },
  ];

  const norm = (v, max, invert = false) => {
    const n = Math.min(100, (v / max) * 100);
    return Math.max(0, Math.round(invert ? 100 - n : n));
  };
  const radarData = [
    { metric: "CTR", value: norm(num(i.ctr), 7) },
    {
      metric: "Cost eff.",
      value: num(i.cpc) > 0 ? norm(num(i.cpc), 50, true) : 0,
    },
    { metric: "Reach", value: norm(int(i.reach), 400000) },
    { metric: "Results", value: Math.min(100, Math.round(results / 5)) },
    { metric: "Freshness", value: norm(num(i.frequency), 8, true) },
    { metric: "Score", value: score },
  ];
  const barData = [
    { name: "Spend", value: Math.round(num(i.spend)), fill: "#1877f2" },
    { name: "Reach", value: int(i.reach), fill: "#8b5cf6" },
    { name: "Impr.", value: int(i.impressions), fill: "#06b6d4" },
    { name: "Clicks", value: int(i.clicks), fill: "#10b981" },
  ];

  const actions = i.actions || [];
  const topActions = [...actions]
    .map((a) => ({ type: a.action_type, value: int(a.value) }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const dateLabel =
    i.date_start && i.date_stop
      ? `${i.date_start} → ${i.date_stop}`
      : item.created_time
        ? `Created ${fmtDate(item.created_time)}`
        : null;

  const tabs = [
    { key: "scale", label: "Where to scale", icon: Rocket },
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "trends", label: "Trends", icon: LineIcon },
    { key: "breakdowns", label: "Audience breakdowns", icon: Layers },
  ];
  if (kind === "adset" && item.targeting) {
    tabs.splice(3, 0, { key: "targeting", label: "Targeting", icon: Users2 });
  }
  if (kind === "ad" && item.creative?.id) {
    tabs.push({ key: "preview", label: "Creative previews", icon: Film });
  }

  const alerts = auditNode(item, { objective, accountCurrency: currency });

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm animate-in fade-in duration-150"
      />
      <div className="relative ml-auto h-full w-full max-w-280 overflow-y-auto bg-white shadow-pop animate-in slide-in-from-right-4 duration-200">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-ink-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={item.name} node={item} size="md" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                  {kind === "campaign"
                    ? "Campaign"
                    : kind === "adset"
                      ? "Ad set"
                      : "Ad"}
                </p>
                <h2 className="text-lg font-bold text-ink-900 truncate">
                  {item.name}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
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
        </header>

        <div className="px-6 py-6 space-y-6">
          {tab === "scale" && <ScalePanel item={item} objective={objective} />}

          {tab === "overview" && (
            <>
              <div className="flex items-center gap-6 flex-wrap">
                <ScoreBadge score={score} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {objConf && (
                      <ObjectiveTag objective={objective} config={objConf} />
                    )}
                    <StatusPill node={item} />
                    {fatigued && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Fatigue ×{num(i.frequency).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm font-semibold ${toneToText(tier.tone)}`}
                  >
                    {tier.label} performance · score {score}/100
                  </p>
                  {dateLabel && (
                    <p className="text-[11px] text-ink-500 mt-1 tabular">
                      {dateLabel}
                    </p>
                  )}
                </div>
              </div>

              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                  All metrics
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg bg-ink-50/60 ring-1 ring-ink-200/60 px-3 py-2.5"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                        {m.label}
                      </p>
                      <p
                        className={`mt-0.5 text-base font-bold tabular leading-tight ${
                          m.highlight
                            ? "text-brand-600"
                            : m.tone === "warn"
                              ? "text-amber-700"
                              : "text-ink-900"
                        }`}
                      >
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Frame
                  title="Performance profile"
                  sub="Normalized 0–100, higher is better"
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart
                      data={radarData}
                      margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
                    >
                      <PolarGrid stroke="#e4e6eb" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fontSize: 11, fill: "#65676b" }}
                      />
                      <PolarRadiusAxis
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name={item.name}
                        dataKey="value"
                        stroke="#1877f2"
                        fill="#1877f2"
                        fillOpacity={0.15}
                        strokeWidth={1.75}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </Frame>

                <Frame title="Volume breakdown">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={barData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f0f2f5"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#65676b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#8a8d91" }}
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
                        cursor={{ fill: "#f0f2f5" }}
                        content={
                          <MinimalTooltip
                            formatter={(v) => v.toLocaleString("en-IN")}
                          />
                        }
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={36}>
                        {barData.map((d, idx) => (
                          <Cell key={idx} fill={d.fill} fillOpacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Frame>
              </div>

              {alerts.length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                    Diagnostic alerts
                  </p>
                  <AlertsList alerts={alerts} currency={currency} />
                </section>
              )}

              <section>
                <DecompositionCard item={item} objective={objective} />
              </section>

              <section>
                <FunnelChart item={item} objective={objective} />
              </section>

              {topActions.length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                    Action breakdown
                  </p>
                  <div className="surface overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-ink-50/50">
                        <tr>
                          <th className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-500 px-4 py-2">
                            Action type
                          </th>
                          <th className="text-right text-[11px] font-bold uppercase tracking-wider text-ink-500 px-4 py-2">
                            Count
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {topActions.map((a) => (
                          <tr key={a.type}>
                            <td className="px-4 py-2 text-ink-700 font-mono text-[12px]">
                              {a.type}
                            </td>
                            <td className="px-4 py-2 text-right tabular font-semibold text-ink-900">
                              {fmtNum(a.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "trends" && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                Daily trends · with anomaly detection
              </p>
              <p className="text-xs text-ink-500 mb-4">
                Pick a metric to chart. Days that deviate &gt;2σ from the 7-day
                baseline are flagged as anomalies — that's where to look first
                for "why did things change?"
              </p>
              <TrendsPanel targetId={item.id} objective={objective} />
            </section>
          )}

          {tab === "targeting" && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                Targeting setup
              </p>
              <TargetingPanel targeting={item.targeting} />
            </section>
          )}

          {tab === "breakdowns" && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                Audience breakdowns
              </p>
              <p className="text-xs text-ink-500 mb-3">
                Performance split by audience characteristic. Pick a dimension
                to see which slices are driving (or dragging) the numbers.
              </p>
              <BreakdownPanel targetId={item.id} objective={objective} />
            </section>
          )}

          {tab === "preview" && kind === "ad" && item.creative?.id && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
                Creative previews
              </p>
              <CreativePreview adId={item.id} creative={item.creative} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Frame({ title, sub, children }) {
  return (
    <div className="rounded-xl ring-1 ring-ink-200/60 p-4 bg-white">
      <div className="mb-2">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {sub && <p className="text-[11px] text-ink-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
