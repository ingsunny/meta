"use client";

import { AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";

const SEV_STYLE = {
  bad: {
    Icon: AlertCircle,
    chip: "bg-rose-50 text-rose-700 ring-rose-100",
    badge: "bg-rose-600 text-white",
  },
  warn: {
    Icon: AlertTriangle,
    chip: "bg-amber-50 text-amber-800 ring-amber-100",
    badge: "bg-amber-600 text-white",
  },
};

export function AlertsBanner({ alerts }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts?.length) return null;

  const total = alerts.reduce((s, a) => s + a.count, 0);
  const visible = expanded ? alerts : alerts.slice(0, 3);

  return (
    <div className="surface overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-ink-100 hover:bg-ink-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <AlertCircle size={14} />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-ink-900">
              {total} {total === 1 ? "issue" : "issues"} flagged across{" "}
              {alerts.length} {alerts.length === 1 ? "category" : "categories"}
            </p>
            <p className="text-[11px] text-ink-500">
              {expanded ? "Hide details" : "Show what to act on first"}
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className={`text-ink-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>
      <ul className="divide-y divide-ink-100">
        {visible.map((a) => {
          const style = SEV_STYLE[a.severity] || SEV_STYLE.warn;
          const Icon = style.Icon;
          return (
            <li key={a.code} className="px-5 py-3 flex items-start gap-3">
              <span
                className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full ${style.chip} ring-1`}
              >
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-bold text-ink-900">
                    {a.title}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${style.badge}`}
                  >
                    {a.count} {a.count === 1 ? "item" : "items"}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-600">
                  e.g. {a.examples.join(", ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AlertsList({ alerts, currency }) {
  if (!alerts?.length) {
    return (
      <div className="surface px-4 py-6 text-center">
        <p className="text-sm text-ink-500">No issues detected.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const style = SEV_STYLE[a.severity];
        if (!style) {
          return (
            <li key={i} className="surface px-4 py-3 flex items-start gap-3">
              <span className="text-sm text-ink-700">{a.message}</span>
            </li>
          );
        }
        const Icon = style.Icon;
        return (
          <li key={i} className="surface px-4 py-3 flex items-start gap-3">
            <span
              className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full ${style.chip} ring-1`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900">{a.title}</p>
              <p className="mt-0.5 text-[12px] text-ink-600 leading-relaxed">
                {a.message}
              </p>
              <p className="mt-1.5 text-[12px] text-ink-800 leading-relaxed">
                <span className="font-semibold">What to do:</span> {a.action}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertChip({ alert }) {
  if (!alert) return null;
  const style = SEV_STYLE[alert.severity];
  if (!style) return null;
  const Icon = style.Icon;
  return (
    <span
      title={`${alert.title} — ${alert.message}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${style.chip}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      {alert.title}
    </span>
  );
}
