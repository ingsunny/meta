"use client";

import { Check, AlertTriangle } from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";

export function ReconcileBadge({ result, childCount, childLabel = "items" }) {
  const { fmtMoney } = useAccount();
  if (!result) return null;
  const { childSpend, diff, matches } = result;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        matches
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-800"
      }`}
      title={
        matches
          ? "Child totals match parent"
          : `Children sum to ${fmtMoney(childSpend)} — a difference of ${fmtMoney(diff)}`
      }
    >
      {matches ? (
        <Check size={11} strokeWidth={3} />
      ) : (
        <AlertTriangle size={11} strokeWidth={2.5} />
      )}
      <span>
        Sum of {childCount} {childLabel} · {fmtMoney(childSpend)}
      </span>
      {!matches && (
        <span className="text-amber-700">
          ({diff > 0 ? "−" : "+"}
          {fmtMoney(Math.abs(diff))})
        </span>
      )}
    </span>
  );
}
