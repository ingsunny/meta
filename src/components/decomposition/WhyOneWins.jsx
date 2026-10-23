"use client";

import { useState } from "react";
import {
  Trophy,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ChevronDown,
  Equal,
} from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";
import { decompose } from "@/lib/meta/decomposition";
import { getResultLabel } from "@/lib/meta/metrics";
import { DecompositionCompare } from "./DecompositionCard";

// Plain-English comparison of two items. Lead with the verdict, explain the
// three levers in everyday language, end with a bottom-line "do this".
// The technical variance-attribution chart is collapsed under "Show the math".
export function WhyOneWins({ a, b, objective }) {
  const { fmtMoney } = useAccount();
  const [showMath, setShowMath] = useState(false);

  const da = decompose(a, objective);
  const db = decompose(b, objective);

  if (da.cpl == null || db.cpl == null) {
    return (
      <div className="surface px-4 py-8 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-500 mb-2">
          <Equal size={16} />
        </span>
        <p className="text-sm font-bold text-ink-900">
          We can't pick a winner yet
        </p>
        <p className="text-[12px] text-ink-500 mt-1 max-w-md mx-auto leading-relaxed">
          To compare cost per result, both items need at least one tracked
          result. Wait a few more days of delivery, or compare them on
          earlier-funnel metrics like clicks and reach instead.
        </p>
      </div>
    );
  }

  const winnerIsA = da.cpl < db.cpl;
  const winner = winnerIsA ? a : b;
  const loser = winnerIsA ? b : a;
  const dW = winnerIsA ? da : db;
  const dL = winnerIsA ? db : da;
  const gapPct = ((dL.cpl - dW.cpl) / dL.cpl) * 100;
  const resultLabel = getResultLabel(objective)?.toLowerCase() || "result";
  const singular = resultLabel.endsWith("s")
    ? resultLabel.slice(0, -1)
    : resultLabel;

  const levers = buildLevers(dW, dL, fmtMoney);

  return (
    <div className="space-y-5">
      <HeroVerdict
        winnerName={winner.name}
        loserName={loser.name}
        winnerCpl={dW.cpl}
        loserCpl={dL.cpl}
        gapPct={gapPct}
        singular={singular}
        fmtMoney={fmtMoney}
      />

      <section>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
          Here's why, in plain English
        </p>
        <div className="space-y-2.5">
          {levers.map((l, i) => (
            <LeverCard
              key={l.key}
              lever={l}
              rank={i + 1}
              winnerName={winner.name}
              loserName={loser.name}
            />
          ))}
          {levers.length === 0 && (
            <div className="surface px-4 py-4 text-[12px] text-ink-600 leading-relaxed">
              The two items have similar funnel mechanics, so the gap comes
              from small accumulated differences rather than one big lever.
            </div>
          )}
        </div>
      </section>

      <BottomLine
        levers={levers}
        winnerName={winner.name}
        loserName={loser.name}
      />

      <div>
        <button
          onClick={() => setShowMath((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-500 hover:text-ink-800 transition-colors"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${showMath ? "rotate-180" : ""}`}
          />
          {showMath ? "Hide the math" : "Show the math (variance attribution)"}
        </button>
        {showMath && (
          <div className="mt-3">
            <DecompositionCompare a={a} b={b} objective={objective} />
          </div>
        )}
      </div>
    </div>
  );
}

function HeroVerdict({
  winnerName,
  loserName,
  winnerCpl,
  loserCpl,
  gapPct,
  singular,
  fmtMoney,
}) {
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Trophy size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Winner
          </p>
          <h3 className="text-lg font-bold text-ink-900 leading-tight mt-0.5 truncate">
            {winnerName}
          </h3>
          <p className="text-sm text-ink-700 mt-2 leading-relaxed">
            Wins by{" "}
            <span className="font-bold text-emerald-700">
              {gapPct.toFixed(0)}%
            </span>{" "}
            on cost per {singular} —{" "}
            <span className="font-bold tabular text-ink-900">
              {fmtMoney(winnerCpl)}
            </span>{" "}
            vs{" "}
            <span className="font-bold tabular text-ink-500">
              {fmtMoney(loserCpl)}
            </span>{" "}
            for{" "}
            <span className="font-semibold text-ink-700 truncate">
              {loserName}
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// Build the lever-by-lever comparison, sorted by who's pulling the bigger
// lever (so the biggest reason for the gap shows first).
function buildLevers(dW, dL, fmtMoney) {
  const out = [];

  if (dW.cpm > 0 && dL.cpm > 0) {
    const diff = ((dL.cpm - dW.cpm) / dL.cpm) * 100;
    const wins = dW.cpm < dL.cpm;
    out.push({
      key: "cpm",
      headline: wins ? "Reaches people cheaper" : "Pays more for reach",
      tone: wins ? "good" : "warn",
      magnitude: Math.abs(diff),
      detail: wins
        ? `It costs ${fmtMoney(dW.cpm)} to reach 1,000 people, vs ${fmtMoney(dL.cpm)} for the other. That's ${Math.abs(diff).toFixed(0)}% cheaper on the auction.`
        : `Pays ${fmtMoney(dW.cpm)} to reach 1,000 people — ${Math.abs(diff).toFixed(0)}% more than the other one. Still wins overall because other levers more than make up for it.`,
      explain:
        "What Facebook charges to show your ad to 1,000 people. Cheaper means a less crowded audience or smarter optimization.",
    });
  }

  if (dW.ctr > 0 && dL.ctr > 0) {
    const ratio = dW.ctr / dL.ctr;
    const wins = dW.ctr > dL.ctr;
    out.push({
      key: "ctr",
      headline: wins ? "Ad lands better with viewers" : "Ad gets ignored more",
      tone: wins ? "good" : "warn",
      magnitude: Math.abs((dW.ctr - dL.ctr) / dL.ctr) * 100,
      detail: wins
        ? `${dW.ctr.toFixed(2)}% of viewers click vs ${dL.ctr.toFixed(2)}% for the other — that's ${ratio.toFixed(1)}× the click rate. Same impressions, more clicks.`
        : `Only ${dW.ctr.toFixed(2)}% of viewers click vs ${dL.ctr.toFixed(2)}% for the other one. Wins anyway because cheaper reach or better conversion makes up the difference.`,
      explain:
        "How often viewers click. Higher = stronger hook, image, or value prop. Lower = creative isn't earning attention.",
    });
  }

  if (dW.cr != null && dL.cr != null && dW.cr > 0 && dL.cr > 0) {
    const ratio = dW.cr / dL.cr;
    const wins = dW.cr > dL.cr;
    out.push({
      key: "cr",
      headline: wins
        ? "Clickers convert more often"
        : "More clickers drop off after the click",
      tone: wins ? "good" : "warn",
      magnitude: Math.abs((dW.cr - dL.cr) / dL.cr) * 100,
      detail: wins
        ? `${dW.cr.toFixed(1)}% of clickers turn into results vs ${dL.cr.toFixed(1)}% — that's ${ratio.toFixed(1)}× the conversion rate. The landing page, offer, and audience fit are stronger.`
        : `Only ${dW.cr.toFixed(1)}% of clickers convert vs ${dL.cr.toFixed(1)}% for the other one. The other levers more than offset this drag.`,
      explain:
        "After the click, do they actually do the thing? Lower means landing-page friction, form issues, or wrong-fit audience.",
    });
  }

  return out.sort((a, b) => b.magnitude - a.magnitude);
}

function LeverCard({ lever, rank }) {
  const styles =
    lever.tone === "good"
      ? {
          wrap: "ring-emerald-200 bg-emerald-50/40",
          chip: "bg-emerald-600",
          tag: "text-emerald-700",
        }
      : {
          wrap: "ring-amber-200 bg-amber-50/40",
          chip: "bg-amber-600",
          tag: "text-amber-700",
        };
  const Icon = lever.tone === "good" ? TrendingUp : TrendingDown;
  return (
    <div className={`rounded-xl ring-1 ${styles.wrap} px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full ${styles.chip} text-white text-[12px] font-bold`}
        >
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon size={14} className={styles.tag} />
            <h4 className="text-sm font-bold text-ink-900 leading-tight">
              {lever.headline}
            </h4>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${styles.tag}`}
            >
              {lever.magnitude > 50
                ? "Huge gap"
                : lever.magnitude > 20
                  ? "Big gap"
                  : "Small gap"}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-ink-700 leading-relaxed">
            {lever.detail}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-500 italic leading-relaxed">
            {lever.explain}
          </p>
        </div>
      </div>
    </div>
  );
}

const FIX_TIPS = {
  cpm: (winner, loser) =>
    `${loser} is paying more for reach. Widen the audience, test fresh placements, or revisit bid strategy to reduce auction pressure.`,
  ctr: (winner, loser) =>
    `${loser}'s creative isn't earning the click. Borrow what works in ${winner} — hook, image, opening line — and run a fresh test in ${loser}.`,
  cr: (winner, loser) =>
    `${loser} loses people after the click. Audit that landing page: speed, mobile rendering, form length, and whether the page actually matches the ad promise.`,
};

function BottomLine({ levers, winnerName, loserName }) {
  if (levers.length === 0) return null;
  const primary = levers[0];
  const tip = FIX_TIPS[primary.key];
  if (!tip) return null;
  return (
    <div className="rounded-xl ring-1 ring-brand-200 bg-brand-50/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
          <Sparkles size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            Bottom line
          </p>
          <p className="mt-1 text-sm text-ink-800 leading-relaxed">
            The biggest reason{" "}
            <span className="font-bold">{winnerName}</span> wins:{" "}
            <span className="font-semibold">
              {primary.headline.toLowerCase()}
            </span>
            . {tip(winnerName, loserName)}
          </p>
        </div>
      </div>
    </div>
  );
}
