"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { RANGE_LABELS } from "@/lib/meta/format";

const OPTIONS = [
  { value: "last_7d", label: "7d" },
  { value: "last_30d", label: "30d" },
  { value: "last_90d", label: "90d" },
  { value: "maximum", label: "All" },
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("range") || "maximum";
  const since = params.get("since") || "";
  const until = params.get("until") || "";
  const isCustom = current === "custom" && since && until;

  const [customOpen, setCustomOpen] = useState(false);
  const [draftSince, setDraftSince] = useState(since || daysAgoISO(7));
  const [draftUntil, setDraftUntil] = useState(until || todayISO());
  const popoverRef = useRef(null);

  useEffect(() => {
    setDraftSince(since || daysAgoISO(7));
    setDraftUntil(until || todayISO());
  }, [since, until]);

  useEffect(() => {
    if (!customOpen) return;
    const onClick = (e) => {
      if (!popoverRef.current?.contains(e.target)) setCustomOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setCustomOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  const pushRange = (next) => {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const setPreset = (value) => {
    const next = new URLSearchParams(params.toString());
    next.delete("since");
    next.delete("until");
    if (value === "maximum") next.delete("range");
    else next.set("range", value);
    pushRange(next);
  };

  const applyCustom = () => {
    if (!draftSince || !draftUntil) return;
    if (draftSince > draftUntil) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", "custom");
    next.set("since", draftSince);
    next.set("until", draftUntil);
    pushRange(next);
    setCustomOpen(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <div
        role="tablist"
        aria-label="Date range"
        className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 p-1"
      >
        {OPTIONS.map((opt) => {
          const active = !isCustom && current === opt.value;
          return (
            <button
              key={opt.value}
              role="tab"
              aria-selected={active}
              onClick={() => setPreset(opt.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                active
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setCustomOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            isCustom
              ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600"
              : "bg-white text-ink-700 ring-1 ring-ink-200 shadow-sm hover:ring-ink-300"
          }`}
          aria-expanded={customOpen}
        >
          <Calendar size={12} />
          {isCustom ? (
            <span className="tabular">
              {since} → {until}
            </span>
          ) : (
            "Custom"
          )}
          <ChevronDown
            size={11}
            className={`transition-transform ${customOpen ? "rotate-180" : ""}`}
          />
        </button>

        {customOpen && (
          <div
            role="dialog"
            className="absolute right-0 mt-2 w-72 rounded-xl bg-white shadow-pop overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <div className="px-4 py-3 border-b border-ink-100">
              <p className="text-sm font-bold text-ink-900">
                Custom date range
              </p>
              <p className="text-[11px] text-ink-500 mt-0.5">
                Pick any start and end date.
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Start date
                </span>
                <input
                  type="date"
                  value={draftSince}
                  max={draftUntil || todayISO()}
                  onChange={(e) => setDraftSince(e.target.value)}
                  className="mt-1 w-full text-sm rounded-md bg-ink-50 px-3 py-1.5 ring-1 ring-ink-200 focus:ring-brand-500 focus:bg-white outline-none transition-all tabular"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  End date
                </span>
                <input
                  type="date"
                  value={draftUntil}
                  min={draftSince}
                  max={todayISO()}
                  onChange={(e) => setDraftUntil(e.target.value)}
                  className="mt-1 w-full text-sm rounded-md bg-ink-50 px-3 py-1.5 ring-1 ring-ink-200 focus:ring-brand-500 focus:bg-white outline-none transition-all tabular"
                />
              </label>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[
                  { label: "Last 14d", days: 14 },
                  { label: "Last 60d", days: 60 },
                  { label: "Last 6mo", days: 180 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setDraftSince(daysAgoISO(p.days));
                      setDraftUntil(todayISO());
                    }}
                    className="px-2 py-1 text-[11px] font-semibold rounded-md bg-ink-100 text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-ink-100 flex items-center justify-between">
              <button
                onClick={() => setCustomOpen(false)}
                className="text-xs font-semibold text-ink-500 hover:text-ink-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCustom}
                disabled={!draftSince || !draftUntil || draftSince > draftUntil}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function RangeBadge({ range, dateStart, dateStop }) {
  let label;
  if (range === "custom") {
    label =
      dateStart && dateStop ? `${dateStart} → ${dateStop}` : "Custom range";
  } else {
    label = RANGE_LABELS[range] || "Lifetime";
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-ink-200 shadow-sm">
      <Calendar size={12} className="text-ink-500" />
      <span className="font-semibold text-ink-800">{label}</span>
      {range !== "custom" && dateStart && dateStop && (
        <span className="text-ink-400 tabular">
          · {dateStart} → {dateStop}
        </span>
      )}
    </span>
  );
}
