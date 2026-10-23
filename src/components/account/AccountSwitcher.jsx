"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Building2, AlertCircle } from "lucide-react";
import { useAccount } from "./AccountContext";

export function AccountSwitcher() {
  const { accounts, account, setAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!accounts?.length) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
        <AlertCircle size={12} />
        No account configured
      </span>
    );
  }

  if (accounts.length === 1) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-ink-200 shadow-sm">
        <Building2 size={12} className="text-ink-500" />
        <span className="font-semibold text-ink-800 max-w-40 truncate">
          {account?.name}
        </span>
        <span className="text-ink-400 font-medium">·</span>
        <span className="font-mono text-[10px] font-semibold text-ink-500">
          {account?.currency}
        </span>
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-ink-200 shadow-sm hover:ring-ink-300 transition-all"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 size={12} className="text-ink-500" />
        <span className="font-semibold text-ink-800 max-w-40 truncate">
          {account?.name}
        </span>
        <span className="text-ink-400 font-medium">·</span>
        <span className="font-mono text-[10px] font-semibold text-ink-500">
          {account?.currency}
        </span>
        <ChevronDown
          size={12}
          className={`text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-72 rounded-xl bg-white shadow-pop overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="px-4 py-2 border-b border-ink-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
              Ad accounts
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {accounts.map((a) => {
              const active = a.id === account?.id;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      setAccount(a.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-brand-50/60 transition-colors flex items-start gap-3 ${
                      active ? "bg-brand-50/40" : ""
                    }`}
                  >
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs">
                      {a.name?.charAt(0).toUpperCase() || "A"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900 truncate">
                        {a.name}
                      </p>
                      <p className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-2">
                        <span className="font-mono">{a.id}</span>
                        <span>·</span>
                        <span className="font-semibold text-ink-700">
                          {a.currency}
                        </span>
                        {!a.active && (
                          <>
                            <span>·</span>
                            <span className="text-amber-700">inactive</span>
                          </>
                        )}
                      </p>
                    </div>
                    {active && (
                      <Check size={14} className="text-brand-600 mt-1.5 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
