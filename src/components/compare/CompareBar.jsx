"use client";

import { GitCompare, X } from "lucide-react";

export function CompareBar({ count, max = 3, onOpen, onClear }) {
  if (count === 0) return null;
  const canOpen = count >= 2;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-3 rounded-full bg-ink-900 px-2 py-2 pl-5 shadow-pop">
        <div className="flex items-center gap-2 text-sm text-white">
          <GitCompare size={14} className="text-brand-400" />
          <span>
            <span className="font-bold tabular">{count}</span>
            <span className="text-ink-400"> / {max} selected</span>
          </span>
        </div>
        <span className="h-5 w-px bg-ink-700" />
        <button
          onClick={onClear}
          className="text-xs font-semibold text-ink-300 hover:text-white transition-colors"
        >
          Clear
        </button>
        <button
          onClick={onOpen}
          disabled={!canOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 hover:bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:bg-ink-700 disabled:text-ink-400 disabled:cursor-not-allowed"
        >
          Compare now
        </button>
      </div>
    </div>
  );
}

export function CompareToggleButton({ active, disabled, onClick, label = "Compare" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={
        disabled
          ? "Maximum 3 items can be compared"
          : active
            ? "Remove from comparison"
            : "Add to comparison"
      }
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-all ${
        active
          ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600"
          : "bg-ink-50 text-ink-500 hover:bg-brand-50 hover:text-brand-600"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {active ? <X size={14} strokeWidth={2.5} /> : <GitCompare size={14} strokeWidth={2.25} />}
      <span className="sr-only">{label}</span>
    </button>
  );
}
