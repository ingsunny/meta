"use client";

import { useAccount } from "@/components/account/AccountContext";
import { ins, getResults, getResultLabel } from "@/lib/meta/metrics";
import { num, int, fmtNum } from "@/lib/meta/format";

const findAction = (acts = [], types) => {
  const m = acts.find((a) => types.includes(a.action_type));
  return m ? int(m.value) : 0;
};

export function FunnelChart({ item, objective }) {
  const { fmtMoney } = useAccount();
  const i = ins(item);
  const acts = i.actions || [];

  const impressions = int(i.impressions);
  const clicks = int(i.clicks);
  const linkClicks = findAction(acts, ["link_click"]);
  const lpv = findAction(acts, [
    "landing_page_view",
    "omni_landing_page_view",
  ]);
  const results = getResults(item, objective);
  const resultLabel = getResultLabel(objective);
  const spend = num(i.spend);

  // Build the funnel only with stages that actually have data.
  const stages = [{ label: "Impressions", value: impressions, kind: "view" }];
  if (clicks > 0) stages.push({ label: "All clicks", value: clicks, kind: "click" });
  if (linkClicks > 0)
    stages.push({ label: "Link clicks", value: linkClicks, kind: "click" });
  if (lpv > 0)
    stages.push({ label: "Landing page views", value: lpv, kind: "lpv" });
  if (results > 0)
    stages.push({ label: resultLabel, value: results, kind: "result" });

  if (impressions === 0) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-500">
          No delivery yet — no funnel to display.
        </p>
      </div>
    );
  }

  const max = impressions;

  return (
    <div className="surface px-5 py-5">
      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Conversion funnel
        </p>
        <p className="text-xs text-ink-500 mt-0.5">
          Drop-off at each step. The biggest leak is where to optimize.
        </p>
      </div>

      <ol className="space-y-1.5">
        {stages.map((s, idx) => {
          const widthPct = (s.value / max) * 100;
          const prev = idx > 0 ? stages[idx - 1] : null;
          const keepPct =
            prev && prev.value > 0 ? (s.value / prev.value) * 100 : null;
          const dropPct = keepPct != null ? 100 - keepPct : null;
          const tone = dropOffTone(s.kind, dropPct);
          return (
            <li key={s.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-semibold text-ink-700">
                  {s.label}
                </span>
                <span className="text-xs tabular font-bold text-ink-900">
                  {fmtNum(s.value)}
                  {prev && keepPct != null && (
                    <span className={`ml-2 ${tone.text}`}>
                      {keepPct.toFixed(1)}% kept
                    </span>
                  )}
                </span>
              </div>
              <div className="h-7 bg-ink-100 rounded overflow-hidden">
                <div
                  className={`h-full ${tone.bar} transition-all`}
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
              {dropPct != null && dropPct >= 20 && (
                <p className="mt-1 text-[11px] text-ink-500">
                  <span className={`font-semibold ${tone.text}`}>
                    {dropPct.toFixed(1)}% drop-off
                  </span>{" "}
                  · {dropOffHint(prev?.kind, s.kind)}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {results > 0 && (
        <div className="mt-5 pt-4 border-t border-ink-100 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            label={`Cost per ${resultLabel.toLowerCase().replace(/s$/, "")}`}
            value={results > 0 ? fmtMoney(spend / results) : "—"}
            tone="brand"
          />
          {linkClicks > 0 && (
            <Metric
              label="Click→Result"
              value={`${((results / linkClicks) * 100).toFixed(2)}%`}
            />
          )}
          {lpv > 0 && (
            <Metric
              label="LPV→Result"
              value={`${((results / lpv) * 100).toFixed(2)}%`}
              hint="Form/landing-page conversion rate. <2% usually means LP friction."
            />
          )}
          <Metric
            label="Overall"
            value={`${((results / impressions) * 100).toFixed(3)}%`}
            hint="Impressions → results. Full funnel conversion."
          />
        </div>
      )}
    </div>
  );
}

function dropOffTone(kind, dropPct) {
  if (dropPct == null)
    return { bar: "bg-blue-500", text: "text-ink-500" };
  // Expected drop-off varies by stage. Treat extreme drop as bad.
  const isExpected = {
    click: dropPct < 99, // huge drop from impressions to clicks is normal
    lpv: dropPct < 50, // 30-50% click→LPV drop is normal
    result: dropPct < 95, // form/landing CR varies wildly
  }[kind];
  if (isExpected === false)
    return { bar: "bg-rose-500", text: "text-rose-700" };
  if (dropPct > 70) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-emerald-500", text: "text-emerald-700" };
}

function dropOffHint(prevKind, nextKind) {
  if (prevKind === "view" && nextKind === "click")
    return "Mostly determined by creative + targeting fit.";
  if (prevKind === "click" && nextKind === "click")
    return "Misclicks and carousel swipes. Below 70% kept suggests creative tap-target issues.";
  if (prevKind === "click" && nextKind === "lpv")
    return "Landing-page reach. Low values usually mean slow LP or redirect issues.";
  if (prevKind === "lpv" && nextKind === "result")
    return "Form / on-page conversion. Optimize headline, form length, or trust signals.";
  return "";
}

function Metric({ label, value, tone, hint }) {
  const valueColor = {
    brand: "text-brand-600",
  }[tone] || "text-ink-900";
  return (
    <div title={hint}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
        {label}
      </p>
      <p className={`text-base font-bold tabular leading-tight mt-0.5 ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}
