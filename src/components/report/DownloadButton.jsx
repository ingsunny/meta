"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";

export function DownloadReportButton({
  campaignId,
  range = "maximum",
  variant = "icon",
  label = "Download report",
}) {
  const { accountId } = useAccount();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        campaign: campaignId,
        range,
      });
      if (accountId) qs.set("account", accountId);
      if (range === "custom") {
        const since = searchParams.get("since");
        const until = searchParams.get("until");
        if (since) qs.set("since", since);
        if (until) qs.set("until", until);
      }
      const url = `/api/meta/report?${qs}`;
      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || "Failed to download report");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || "campaign-report.xlsx";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Download failed:", err);
      alert(`Couldn't download report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        title={label}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-500 hover:bg-emerald-50 hover:text-emerald-700 transition-all disabled:opacity-50 disabled:cursor-wait"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} strokeWidth={2.25} />
        )}
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink-800 ring-1 ring-ink-200 shadow-sm hover:ring-ink-300 hover:text-brand-600 transition-all disabled:opacity-60 disabled:cursor-wait"
    >
      {loading ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          Building…
        </>
      ) : (
        <>
          <Download size={13} strokeWidth={2.25} />
          {label}
        </>
      )}
    </button>
  );
}
