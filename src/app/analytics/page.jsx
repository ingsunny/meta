"use client";

// /analytics — list of analytics campaigns + inline "create new" form.
// Each card links to /analytics/[id] where the user can upload more CSVs
// and see the full insights dashboard.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  FolderOpen,
  FileText,
  Clock,
  ChevronRight,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

function formatRelativeDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return null;
  const diffMs = Date.now() - d.valueOf();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export default function AnalyticsListPage() {
  const [campaigns, setCampaigns] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    try {
      const r = await fetch("/api/analytics/campaigns");
      const j = await r.json();
      if (j.success) setCampaigns(j.campaigns);
      else setLoadError(j.error || "Failed to load");
    } catch (e) {
      setLoadError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow={
          <p className="text-[11px] font-semibold uppercase analytics-wider text-emerald-700">
            Conversion analytics
          </p>
        }
        title="Analytics campaigns"
        sub={
          campaigns && campaigns.length > 0
            ? `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · upload new CSV exports anytime — duplicates are skipped automatically.`
            : "Create a campaign, upload your daily CSV export, and get insights ready for real decisions."
        }
      />

      <section className="mb-6">
        <CreateForm onCreated={load} />
      </section>

      <section>
        {!campaigns && !loadError && (
          <div className="surface px-6 py-10 text-center text-ink-500 text-sm">
            Loading campaigns…
          </div>
        )}
        {loadError && (
          <div className="surface px-6 py-10 text-center">
            <p className="text-sm font-semibold text-rose-700">Couldn't load</p>
            <p className="text-[12px] text-ink-500 mt-1">{loadError}</p>
          </div>
        )}
        {campaigns && campaigns.length === 0 && (
          <div className="surface px-6 py-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-3">
              <FolderOpen size={20} />
            </span>
            <p className="text-sm font-semibold text-ink-900">
              No campaigns yet
            </p>
            <p className="text-[12px] text-ink-500 mt-1 max-w-md mx-auto leading-relaxed">
              Create one above to start analytics. Name it after the offer or
              client — you'll be able to dump new CSV exports into it daily.
            </p>
          </div>
        )}
        {campaigns && campaigns.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onChanged={load} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CreateForm({ onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/analytics/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const j = await r.json();
      if (j.success) {
        setName("");
        onCreated?.();
      } else {
        setError(j.error || "Couldn't create");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="surface flex flex-col md:flex-row gap-2.5 px-4 py-3"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Campaign name — e.g. Medicare · TKR58 · May"
        className="flex-1 px-3.5 py-2 text-sm rounded-lg ring-1 ring-ink-200/70 bg-white text-ink-900 placeholder:text-ink-400 outline-none focus:ring-2 focus:ring-emerald-400"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={14} />
        Create campaign
      </button>
      {error && (
        <p className="text-[12px] text-rose-700 self-center md:ml-2">{error}</p>
      )}
    </form>
  );
}

function CampaignCard({ campaign, onChanged }) {
  return (
    <li className="relative">
      <Link
        href={`/analytics/${campaign.id}`}
        className="block surface px-4 py-4 hover:ring-emerald-300 transition-shadow group"
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <FolderOpen size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-bold text-ink-900 leading-tight truncate pr-10"
              title={campaign.name}
            >
              {campaign.name}
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11.5px] text-ink-600">
              <span className="inline-flex items-center gap-1 tabular">
                <FileText size={11} className="text-ink-400" />
                <span className="font-bold text-ink-900">
                  {(campaign.eventCount || 0).toLocaleString("en-US")}
                </span>{" "}
                events
              </span>
              {campaign.uploadCount > 0 && (
                <span className="tabular">
                  <span className="font-semibold text-ink-700">
                    {campaign.uploadCount}
                  </span>{" "}
                  upload{campaign.uploadCount === 1 ? "" : "s"}
                </span>
              )}
              {campaign.lastUploadAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} className="text-ink-400" />
                  {formatRelativeDate(campaign.lastUploadAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  <Clock size={11} />
                  No uploads yet
                </span>
              )}
            </div>
          </div>
          <ChevronRight
            size={16}
            className="shrink-0 text-ink-300 group-hover:text-emerald-600 transition-colors mt-1"
          />
        </div>
      </Link>
      <CardMenu campaign={campaign} onChanged={onChanged} />
    </li>
  );
}

// Three-dot dropdown anchored to the top-right of the card. Sits above the
// Link so clicks here don't navigate; closes on outside-click or Escape.
function CardMenu({ campaign, onChanged }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleDelete = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await fetch(`/api/analytics/campaigns/${campaign.id}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (j.success) {
        setOpen(false);
        setConfirming(false);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className="absolute top-3 right-3 z-10">
      <button
        type="button"
        aria-label="Campaign actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
          setConfirming(false);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-colors"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 min-w-48 rounded-lg ring-1 ring-ink-200 bg-white shadow-lg py-1 text-sm">
          {confirming ? (
            <div className="px-3 py-2">
              <p className="text-[12px] font-semibold text-ink-800 mb-2 leading-snug">
                Delete "{campaign.name}" and all its events?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirming(false);
                  }}
                  className="text-[11.5px] font-semibold text-ink-700 hover:text-ink-900 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1 rounded bg-rose-600 text-white text-[11.5px] font-bold px-2.5 py-1 hover:bg-rose-700 disabled:opacity-60"
                >
                  <Trash2 size={11} />
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirming(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-rose-700 hover:bg-rose-50 font-semibold"
            >
              <Trash2 size={13} />
              Delete campaign
            </button>
          )}
        </div>
      )}
    </div>
  );
}
