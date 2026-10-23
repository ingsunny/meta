"use client";

import { ArrowRight } from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";
import { decompose } from "@/lib/meta/decomposition";
import { fmtPct } from "@/lib/meta/format";

// "How does cost-per-result break down?" — render the chain visually.
export function DecompositionCard({ item, objective }) {
  const { fmtMoney } = useAccount();
  const d = decompose(item, objective);

  if (d.cpl == null && d.cpm === 0) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-500">
          Not enough delivery yet to decompose cost per result.
        </p>
      </div>
    );
  }

  const steps = [
    {
      label: "Auction cost",
      value: fmtMoney(d.cpm),
      metric: "CPM",
      tone: "auction",
      hint: "Cost to reach 1,000 people. Rising = more competition or smaller audience.",
    },
    {
      label: "Creative relevance",
      value: fmtPct(d.ctr),
      metric: "CTR",
      tone: "creative",
      hint: "Click-through rate. Falling = creative not resonating or fatigued.",
    },
    {
      label: "Post-click conversion",
      value: d.cr != null ? fmtPct(d.cr) : "—",
      metric: "CR",
      tone: "funnel",
      hint:
        d.cr == null
          ? "No conversions tracked yet."
          : "Share of clicks that became results. Low = landing page or form friction.",
    },
  ];

  const toneClass = {
    auction: "bg-blue-50 text-blue-700",
    creative: "bg-violet-50 text-violet-700",
    funnel: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
            Cost decomposition
          </p>
          <p className="text-xs text-ink-500 mt-0.5">
            Where the cost-per-result actually comes from. Hover any lever for
            what to watch.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
            Result
          </p>
          <p className="text-2xl font-bold tabular text-brand-600 leading-tight">
            {d.cpl != null ? fmtMoney(d.cpl) : "—"}
          </p>
          <p className="text-[10px] text-ink-500">cost per result</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-7 lg:items-center">
        {steps.map((s, idx) => (
          <Step
            key={s.metric}
            step={s}
            toneClass={toneClass}
            showArrow={idx < steps.length - 1}
          />
        ))}
        <div className="hidden lg:flex items-center justify-center">
          <ArrowRight size={18} className="text-ink-400" />
        </div>
        <div className="col-span-3 lg:col-span-1 rounded-lg bg-brand-50 ring-2 ring-brand-200 px-3 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            CPL
          </p>
          <p className="text-xl font-bold tabular text-brand-700 mt-1 leading-tight">
            {d.cpl != null ? fmtMoney(d.cpl) : "—"}
          </p>
        </div>
      </div>

      <FunnelStrip d={d} />
    </div>
  );
}

function Step({ step, toneClass, showArrow }) {
  return (
    <>
      <div
        title={step.hint}
        className={`rounded-lg ${toneClass[step.tone]} px-3 py-3 text-center lg:col-span-2`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {step.label}
        </p>
        <p className="text-lg font-bold tabular mt-1 leading-tight">
          {step.value}
        </p>
        <p className="text-[10px] opacity-70 mt-0.5 font-mono">{step.metric}</p>
      </div>
      {showArrow && (
        <div className="hidden lg:flex items-center justify-center">
          <ArrowRight size={18} className="text-ink-400" />
        </div>
      )}
    </>
  );
}

// One-line funnel hint underneath when we have linkClicks / lpv data:
// shows where in the funnel volume is being lost.
function FunnelStrip({ d }) {
  if (d.impressions === 0) return null;
  const linkRatio =
    d.linkClicks > 0 && d.clicks > 0 ? d.linkClicks / d.clicks : null;
  const lpvRatio =
    d.lpv > 0 && d.linkClicks > 0 ? d.lpv / d.linkClicks : null;
  if (linkRatio == null && lpvRatio == null) return null;

  const hints = [];
  if (linkRatio != null && linkRatio < 0.7) {
    hints.push(
      `Only ${Math.round(linkRatio * 100)}% of clicks are real link clicks — the rest may be misclicks or carousel swipes.`,
    );
  }
  if (lpvRatio != null && lpvRatio < 0.7) {
    hints.push(
      `${Math.round((1 - lpvRatio) * 100)}% of link clicks never reached the landing page — likely a slow LP or bad redirect.`,
    );
  }
  if (hints.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg bg-amber-50/70 ring-1 ring-amber-100 px-3 py-2">
      <ul className="space-y-0.5">
        {hints.map((h, i) => (
          <li key={i} className="text-[12px] text-amber-900 leading-relaxed">
            ⚠ {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Side-by-side decomposition for two items, with variance attribution.
export function DecompositionCompare({ a, b, objective }) {
  const { fmtMoney } = useAccount();
  const da = decompose(a, objective);
  const db = decompose(b, objective);

  if (da.cpl == null || db.cpl == null) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-500">
          Both items need at least one tracked result for cost decomposition.
        </p>
      </div>
    );
  }

  const winnerIsA = da.cpl < db.cpl;
  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const dWinner = winnerIsA ? da : db;
  const dLoser = winnerIsA ? db : da;
  const gapPct = ((dLoser.cpl - dWinner.cpl) / dLoser.cpl) * 100;

  const levers = [
    {
      label: "CPM (auction)",
      key: "cpm",
      vA: dWinner.cpm,
      vB: dLoser.cpm,
      lowerBetter: true,
      fmt: fmtMoney,
    },
    {
      label: "CTR (creative)",
      key: "ctr",
      vA: dWinner.ctr,
      vB: dLoser.ctr,
      lowerBetter: false,
      fmt: (v) => `${v.toFixed(2)}%`,
    },
    {
      label: "CR (post-click)",
      key: "cr",
      vA: dWinner.cr,
      vB: dLoser.cr,
      lowerBetter: false,
      fmt: (v) => (v != null ? `${v.toFixed(2)}%` : "—"),
    },
  ];

  const totalLog = Math.log(dLoser.cpl / dWinner.cpl);
  const contributions = levers.map((l) => {
    if (l.vA == null || l.vB == null || l.vA <= 0 || l.vB <= 0) {
      return { ...l, share: 0 };
    }
    const term = l.lowerBetter
      ? Math.log(l.vB) - Math.log(l.vA)
      : Math.log(l.vA) - Math.log(l.vB);
    const share = totalLog === 0 ? 0 : Math.round((term / totalLog) * 100);
    return { ...l, share, term };
  });

  return (
    <div className="surface px-5 py-5">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Variance attribution
        </p>
        <p className="text-sm text-ink-700 mt-1 leading-relaxed">
          <span className="font-bold text-ink-900">{winner.name}</span> beats{" "}
          <span className="font-bold text-ink-900">{loser.name}</span> by{" "}
          <span className="font-bold text-brand-700">
            {gapPct.toFixed(0)}%
          </span>{" "}
          on cost per result ({fmtMoney(dWinner.cpl)} vs{" "}
          {fmtMoney(dLoser.cpl)}). Here's where the gap comes from:
        </p>
      </div>

      <div className="space-y-2">
        {contributions.map((c) => {
          const share = Math.max(0, c.share);
          return (
            <div key={c.key} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-3 text-xs font-semibold text-ink-700">
                {c.label}
              </div>
              <div className="col-span-3 text-xs tabular text-ink-600 text-right">
                {c.fmt(c.vA)}
                <span className="text-ink-400 mx-1">vs</span>
                {c.fmt(c.vB)}
              </div>
              <div className="col-span-5 h-2 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </div>
              <div className="col-span-1 text-xs font-bold tabular text-brand-700 text-right">
                {share}%
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 pt-4 border-t border-ink-100 text-[12px] text-ink-600 leading-relaxed">
        <span className="font-semibold text-ink-800">Read this as:</span>{" "}
        share of the cost gap that each lever explains. The biggest bar is the
        primary driver — focus optimization there first.
      </p>
    </div>
  );
}
