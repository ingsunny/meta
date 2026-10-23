"use client";

// "Today's priorities" notification bell + dropdown panel.
// Sits in the campaigns page header. Aggregates the top actionable items
// across the whole account (output of buildPriorityQueue) and surfaces them
// as a ranked, click-to-drill list. The bell badge color and count make the
// state visible without expanding the panel.

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  X,
  ChevronRight,
} from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";

const SEV_STYLE = {
  bad: {
    Icon: AlertCircle,
    iconBg: "bg-rose-100 text-rose-700 ring-rose-200",
    text: "text-rose-700",
    label: "Urgent",
  },
  warn: {
    Icon: AlertTriangle,
    iconBg: "bg-amber-100 text-amber-700 ring-amber-200",
    text: "text-amber-700",
    label: "Watch",
  },
  good: {
    Icon: TrendingUp,
    iconBg: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    text: "text-emerald-700",
    label: "Opportunity",
  },
};

export function PriorityBell({ priorities, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const count = priorities?.length || 0;
  const hasBad = priorities?.some((p) => p.severity === "bad");
  const hasWarn = priorities?.some((p) => p.severity === "warn");
  const badgeColor = hasBad
    ? "bg-rose-600"
    : hasWarn
      ? "bg-amber-600"
      : "bg-emerald-600";

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => e.key === "Escape" && setOpen(false);
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  if (count === 0) {
    return (
      <button
        type="button"
        disabled
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-400 ring-1 ring-ink-200/70 cursor-default"
        title="No priorities — all clear"
        aria-label="No priorities — all clear"
      >
        <Bell size={15} />
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-700 ring-1 ring-ink-200/70 hover:bg-ink-50 transition-colors ${
          open ? "ring-brand-300 bg-brand-50/40" : ""
        }`}
        aria-label={`${count} ${count === 1 ? "priority" : "priorities"} need attention`}
        aria-expanded={open}
      >
        {open ? <BellRing size={15} /> : <Bell size={15} />}
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full ${badgeColor} text-white text-[10px] font-bold tabular ring-2 ring-white`}
        >
          {count > 99 ? "99+" : count}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] z-30">
          <PriorityPanel
            priorities={priorities}
            onSelect={(item) => {
              setOpen(false);
              onSelect?.(item);
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function PriorityPanel({ priorities, onSelect, onClose }) {
  const { fmtMoney } = useAccount();
  const counts = priorities.reduce(
    (acc, p) => {
      acc[p.severity] = (acc[p.severity] || 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="rounded-xl bg-white ring-1 ring-ink-200/70 shadow-xl overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-ink-100 bg-linear-to-br from-brand-50/40 to-white">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            Today's priorities
          </p>
          <p className="text-sm font-bold text-ink-900 leading-tight">
            {priorities.length}{" "}
            {priorities.length === 1 ? "thing" : "things"} to look at first
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {counts.bad > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {counts.bad} urgent
              </span>
            )}
            {counts.warn > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {counts.warn} watch
              </span>
            )}
            {counts.good > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {counts.good} opportunity
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label="Close priorities"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="max-h-[60vh] overflow-y-auto divide-y divide-ink-100">
        {priorities.map((p) => (
          <PriorityRow
            key={p.id}
            priority={p}
            onSelect={() => onSelect(p)}
            fmtMoney={fmtMoney}
          />
        ))}
      </ul>

      <div className="px-4 py-2.5 border-t border-ink-100 bg-ink-50/40">
        <p className="text-[11px] text-ink-500 leading-relaxed">
          Ranked by severity × spend at stake. Click any item to drill in.
        </p>
      </div>
    </div>
  );
}

function PriorityRow({ priority, onSelect, fmtMoney }) {
  const s = SEV_STYLE[priority.severity] || SEV_STYLE.warn;
  const Icon = s.Icon;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-ink-50/60 transition-colors"
      >
        <span
          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full ${s.iconBg} ring-1`}
        >
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${s.text}`}
            >
              {s.label}
            </span>
            {priority.spend > 0 && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400 tabular">
                · {fmtMoney(priority.spend)} at stake
              </span>
            )}
          </div>
          <p className="text-[13px] font-bold text-ink-900 leading-tight mt-0.5">
            {priority.alert.title}
          </p>
          <p
            className="text-[11px] text-ink-500 mt-0.5 truncate"
            title={priority.name}
          >
            in{" "}
            <span className="font-semibold text-ink-700">{priority.name}</span>
          </p>
          <p className="text-[11.5px] text-ink-700 mt-1.5 leading-relaxed">
            {priority.alert.message}
          </p>
          <p className="text-[11.5px] text-ink-800 mt-1 leading-relaxed">
            <span className="font-semibold">Do:</span> {priority.alert.action}
          </p>
        </div>
        <ChevronRight size={14} className="shrink-0 text-ink-300 mt-1" />
      </button>
    </li>
  );
}
