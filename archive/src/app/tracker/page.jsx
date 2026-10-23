"use client";

// /tracker — live landing-page events dashboard.
//
// Reads the Google Sheet populated by tracker-script.js / tracker-appscript.gs
// directly from the browser (Apps Script's doGet allows CORS). The Apps Script
// "Web app" URL is saved in localStorage so different operators can use their
// own sheets without redeploying.

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  Settings as SettingsIcon,
  MousePointerClick,
  Users,
  Eye,
  Gauge,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Link2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";

// Auto-refresh stays a per-browser preference so we keep it in localStorage.
// The sheet URL itself is now persisted server-side via /api/tracker/settings
// so the dashboard works for any operator on the install without re-entering it.
const LS_AUTO = "tracker_auto_refresh";

const EMPTY_NAMES = { campaigns: {}, adsets: {}, ads: {}, syncedAt: null, account: null };

// Returns the display label for an ID using a name lookup map. Falls back to
// the raw id when no name is known, so the dashboard still works pre-sync.
function labelFor(id, map) {
  if (!id) return id;
  const name = map && map[String(id)];
  return name ? name : id;
}
function relTime(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtInt(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}
function fmtPct(n) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtSec(n) {
  if (!isFinite(n) || n == null) return "—";
  if (n < 60) return `${n.toFixed(0)}s`;
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}m ${s}s`;
}
function clean(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

// ── schema normalization ──────────────────────────────────────────────
// The sheet may contain rows written by EITHER:
//   - the new tracker-script.js (40 typed columns), or
//   - the old url-tracker5.js (7 friendly-named columns).
// We map both into one canonical row so the UI can stay agnostic.

const ALIASES = {
  timestamp: ["timestamp", "Timestamp"],
  type: ["type", "Type"],
  landing_url: ["landing_url", "Full Landing URL"],
  fbclid: ["fbclid", "fbclid / aff_click_id"],
  ad_name: ["ad_name", "Ad Name (sc)", "sc"],
  referrer: ["referrer", "Referrer"],
  cta_url: ["cta_url", "CTA URL"],
  time_on_page: ["time_on_page", "Time on Page (sec)"],
  user_agent: ["user_agent", "User Agent"],
  session_id: ["session_id"],
  visitor_id: ["visitor_id"],
  visit_count: ["visit_count"],
  hostname: ["hostname"],
  path: ["path"],
  page_title: ["page_title"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign"],
  utm_content: ["utm_content"],
  utm_term: ["utm_term"],
  utm_id: ["utm_id"],
  cta_text: ["cta_text"],
  cta_id: ["cta_id"],
  cta_class: ["cta_class"],
  cta_click_index: ["cta_click_index"],
  scroll_depth: ["scroll_depth"],
  device: ["device"],
  browser: ["browser"],
  os: ["os"],
  language: ["language"],
  timezone: ["timezone"],
  screen_w: ["screen_w"],
  screen_h: ["screen_h"],
  viewport_w: ["viewport_w"],
  viewport_h: ["viewport_h"],
  dpr: ["dpr"],
  hardware_concurrency: ["hardware_concurrency"],
  device_memory: ["device_memory"],
  touch_points: ["touch_points"],
  connection: ["connection"],
};

function pickAlias(raw, key) {
  const aliases = ALIASES[key] || [key];
  for (const a of aliases) {
    if (raw[a] !== undefined && raw[a] !== null && raw[a] !== "") return raw[a];
  }
  return "";
}

function deviceFromUA(ua) {
  const u = String(ua || "").toLowerCase();
  if (!u) return "";
  if (/ipad|tablet|playbook|silk|kindle/.test(u)) return "tablet";
  if (/android|mobi|iphone|ipod|phone|mobile/.test(u)) return "mobile";
  return "desktop";
}
function browserFromUA(ua) {
  const u = String(ua || "");
  if (!u) return "";
  if (/edg\//i.test(u)) return "Edge";
  if (/fban|fbav|fb_iab/i.test(u)) return "Facebook IAB";
  if (/instagram/i.test(u)) return "Instagram IAB";
  if (/chrome|crios/i.test(u)) return "Chrome";
  if (/firefox|fxios/i.test(u)) return "Firefox";
  if (/safari/i.test(u)) return "Safari";
  if (/msie|trident/i.test(u)) return "IE";
  return "Other";
}
function osFromUA(ua) {
  const u = String(ua || "");
  if (!u) return "";
  if (/windows/i.test(u)) return "Windows";
  if (/android/i.test(u)) return "Android";
  if (/iphone|ipad|ipod/i.test(u)) return "iOS";
  if (/mac os/i.test(u)) return "macOS";
  if (/linux/i.test(u)) return "Linux";
  return "Other";
}

function isTemplate(v) {
  if (!v) return true;
  return /^\{.*\}$/.test(String(v).trim());
}

function parseParams(landingUrl) {
  if (!landingUrl) return {};
  try {
    const u = new URL(landingUrl);
    const out = {};
    u.searchParams.forEach((v, k) => { out[k] = v; });
    return out;
  } catch {
    return {};
  }
}

function normalizeRow(raw) {
  const out = {};
  for (const key of Object.keys(ALIASES)) out[key] = pickAlias(raw, key);

  // If utm_* / fbclid aren't broken out as columns, parse them from landing_url.
  const params = parseParams(out.landing_url);
  const fillFromParams = (k, names) => {
    if (out[k]) return;
    for (const n of names) {
      const v = params[n];
      if (v && !isTemplate(v)) { out[k] = v; return; }
    }
  };
  fillFromParams("utm_source",   ["utm_source"]);
  fillFromParams("utm_medium",   ["utm_medium"]);
  fillFromParams("utm_campaign", ["utm_campaign", "utm_id"]);
  fillFromParams("utm_content",  ["utm_content"]);
  fillFromParams("utm_term",     ["utm_term"]);
  fillFromParams("utm_id",       ["utm_id"]);
  if (!out.fbclid || isTemplate(out.fbclid)) {
    const v = params["aff_click_id"] || params["fbclid"];
    if (v && !isTemplate(v)) out.fbclid = v;
    else out.fbclid = "";
  }
  if (!out.ad_name || isTemplate(out.ad_name)) {
    const v = params["sc"] || params["ad_name"];
    if (v && !isTemplate(v)) out.ad_name = v;
    else out.ad_name = "";
  }
  if (!out.hostname && out.landing_url) {
    try { out.hostname = new URL(out.landing_url).hostname; } catch {}
  }
  if (!out.path && out.landing_url) {
    try { out.path = new URL(out.landing_url).pathname || "/"; } catch {}
  }

  // Derive device / browser / os from user_agent when missing.
  if (!out.device) out.device = deviceFromUA(out.user_agent);
  if (!out.browser) out.browser = browserFromUA(out.user_agent);
  if (!out.os) out.os = osFromUA(out.user_agent);

  // Coerce numeric-ish strings the sheet returns
  for (const k of ["time_on_page", "scroll_depth", "cta_click_index", "visit_count"]) {
    const v = out[k];
    if (v === "" || v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
function dayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}
function hourKey(iso) {
  if (!iso) return -1;
  const d = new Date(iso);
  if (isNaN(d)) return -1;
  return d.getHours();
}

export default function TrackerPage() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [filters, setFilters] = useState({
    campaign: "",
    adset: "",
    ad: "",
    adName: "",
    device: "",
    type: "",
    days: "all",
  });

  const [names, setNames] = useState(EMPTY_NAMES);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(null);

  // ── boot: load auto-refresh from localStorage + sheet URL from server ──
  useEffect(() => {
    try {
      const a = localStorage.getItem(LS_AUTO) === "1";
      setAutoRefresh(a);
    } catch (_) {}

    let cancelled = false;
    fetch("/api/tracker/settings")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const u = j?.sheetUrl || "";
        setSheetUrl(u);
        setDraftUrl(u);
        setSettingsUpdatedAt(j?.updatedAt || null);
        if (!u) setShowSettings(true);
      })
      .catch(() => {
        if (!cancelled) setShowSettings(true);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // ── fetch (via /api/tracker proxy to dodge Apps Script CORS) ───────────
  const fetchData = async (url) => {
    const target = url ?? sheetUrl;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/tracker?url=${encodeURIComponent(target)}`,
        { method: "GET", cache: "no-store" },
      );
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      const list = Array.isArray(j) ? j : j.rows || [];
      const normalized = list.map(normalizeRow);
      setRows(normalized);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sheetUrl) fetchData(sheetUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetUrl]);

  // ── auto-refresh (30s) ────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh || !sheetUrl) return;
    const id = setInterval(() => fetchData(sheetUrl), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, sheetUrl]);

  // Persist the sheet URL server-side. The dashboard only writes here when
  // the user clicks Save — autoRefresh / tab state etc. do not touch it.
  const saveUrl = async () => {
    setSavingSettings(true);
    try {
      const r = await fetch("/api/tracker/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: draftUrl }),
      });
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setSheetUrl(j.sheetUrl || draftUrl);
      setSettingsUpdatedAt(j.updatedAt || null);
      setShowSettings(false);
    } catch (e) {
      setError(`Failed to save settings: ${e.message || e}`);
    } finally {
      setSavingSettings(false);
    }
  };
  const toggleAuto = () => {
    const next = !autoRefresh;
    setAutoRefresh(next);
    try { localStorage.setItem(LS_AUTO, next ? "1" : "0"); } catch (_) {}
  };

  // ── name lookup (campaigns / adsets / ads from Meta) ───────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tracker/names")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) {
          setNames({
            campaigns: j.campaigns || {},
            adsets: j.adsets || {},
            ads: j.ads || {},
            syncedAt: j.syncedAt || null,
            account: j.account || null,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const syncNames = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await fetch("/api/tracker/names", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setNames({
        campaigns: j.campaigns || {},
        adsets: j.adsets || {},
        ads: j.ads || {},
        syncedAt: j.syncedAt || null,
        account: j.account || null,
      });
    } catch (e) {
      setSyncError(e.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  // ── filter helper: changing a parent dim auto-clears its children ─────
  const setFilter = (key, value) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "campaign") { next.adset = ""; next.ad = ""; }
      else if (key === "adset") { next.ad = ""; }
      return next;
    });
  };
  const clearFilters = () =>
    setFilters({
      campaign: "", adset: "", ad: "", adName: "",
      device: "", type: "", days: "all",
    });

  // ── derive filter universes + filtered rows ───────────────────────────
  const filtered = useMemo(() => {
    let r = rows;
    if (filters.days !== "all") {
      const days = parseInt(filters.days, 10);
      const cutoff = Date.now() - days * 86400000;
      r = r.filter((x) => {
        const t = new Date(x.timestamp).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }
    if (filters.campaign) r = r.filter((x) => clean(x.utm_campaign) === filters.campaign);
    if (filters.adset) r = r.filter((x) => clean(x.utm_term) === filters.adset);
    if (filters.ad) r = r.filter((x) => clean(x.utm_content) === filters.ad);
    if (filters.adName) r = r.filter((x) => clean(x.ad_name) === filters.adName);
    if (filters.device) r = r.filter((x) => clean(x.device) === filters.device);
    if (filters.type) r = r.filter((x) => clean(x.type) === filters.type);
    return r;
  }, [rows, filters]);

  // Facets cascade: adsets are limited to the selected campaign; ads to the
  // selected campaign + adset. Days filter is applied at the top so dropdowns
  // also reflect the active time window.
  const facets = useMemo(() => {
    const bucket = (list, key) => {
      const m = new Map();
      for (const r of list) {
        const v = clean(r[key]);
        if (!v) continue;
        m.set(v, (m.get(v) || 0) + 1);
      }
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => ({ value: v, count: n }));
    };
    let base = rows;
    if (filters.days !== "all") {
      const cutoff = Date.now() - parseInt(filters.days, 10) * 86400000;
      base = base.filter((x) => {
        const t = new Date(x.timestamp).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }
    const campaignScoped = filters.campaign
      ? base.filter((x) => clean(x.utm_campaign) === filters.campaign)
      : base;
    const adsetScoped = filters.adset
      ? campaignScoped.filter((x) => clean(x.utm_term) === filters.adset)
      : campaignScoped;
    return {
      campaign: bucket(base, "utm_campaign"),
      adset: bucket(campaignScoped, "utm_term"),
      ad: bucket(adsetScoped, "utm_content"),
      adName: bucket(base, "ad_name"),
      device: bucket(base, "device"),
      type: bucket(base, "type"),
    };
  }, [rows, filters.days, filters.campaign, filters.adset]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const landings = filtered.filter((r) => r.type === "PAGE_LANDED");
    const clicks = filtered.filter((r) => r.type === "CTA_CLICKED");
    const exits = filtered.filter((r) => r.type === "PAGE_EXIT");
    const uniqSessions = new Set(filtered.map((r) => clean(r.session_id)).filter(Boolean));
    const uniqVisitors = new Set(filtered.map((r) => clean(r.visitor_id)).filter(Boolean));

    const ctaSessions = new Set(clicks.map((r) => clean(r.session_id)).filter(Boolean));
    const sessionCTR = uniqSessions.size ? ctaSessions.size / uniqSessions.size : 0;

    const totalCTR = landings.length ? clicks.length / landings.length : 0;

    const clickTimes = clicks
      .map((r) => Number(r.time_on_page))
      .filter((n) => Number.isFinite(n));
    const avgTimeToClick = clickTimes.length
      ? clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length
      : null;

    const allEngaged = filtered.filter((r) => r.type !== "PAGE_LANDED");
    const scrolls = allEngaged
      .map((r) => Number(r.scroll_depth))
      .filter((n) => Number.isFinite(n));
    const avgScroll = scrolls.length
      ? scrolls.reduce((a, b) => a + b, 0) / scrolls.length
      : null;

    const exitTimes = exits
      .map((r) => Number(r.time_on_page))
      .filter((n) => Number.isFinite(n));
    const avgTimeOnPage = exitTimes.length
      ? exitTimes.reduce((a, b) => a + b, 0) / exitTimes.length
      : avgTimeToClick;

    return {
      landings: landings.length,
      clicks: clicks.length,
      exits: exits.length,
      uniqSessions: uniqSessions.size,
      uniqVisitors: uniqVisitors.size,
      sessionCTR,
      totalCTR,
      avgTimeToClick,
      avgScroll,
      avgTimeOnPage,
    };
  }, [filtered]);

  // ── daily series ──────────────────────────────────────────────────────
  const daily = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const k = dayKey(r.timestamp);
      if (!k) continue;
      if (!m.has(k)) m.set(k, { date: k, landings: 0, clicks: 0, exits: 0 });
      const o = m.get(k);
      if (r.type === "PAGE_LANDED") o.landings++;
      else if (r.type === "CTA_CLICKED") o.clicks++;
      else if (r.type === "PAGE_EXIT") o.exits++;
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // ── hour series ───────────────────────────────────────────────────────
  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, "0")}:00`,
      landings: 0,
      clicks: 0,
    }));
    for (const r of filtered) {
      const h = hourKey(r.timestamp);
      if (h < 0) continue;
      if (r.type === "PAGE_LANDED") arr[h].landings++;
      else if (r.type === "CTA_CLICKED") arr[h].clicks++;
    }
    return arr;
  }, [filtered]);

  // ── breakdowns by dimension ──────────────────────────────────────────
  const buildBreakdown = (key, label = key) => {
    const m = new Map();
    for (const r of filtered) {
      const v = clean(r[key]) || "(none)";
      if (!m.has(v)) m.set(v, { value: v, landings: 0, clicks: 0, sessions: new Set() });
      const o = m.get(v);
      o.sessions.add(clean(r.session_id));
      if (r.type === "PAGE_LANDED") o.landings++;
      else if (r.type === "CTA_CLICKED") o.clicks++;
    }
    return [...m.values()]
      .map((o) => ({
        value: o.value,
        landings: o.landings,
        clicks: o.clicks,
        sessions: o.sessions.size,
        ctr: o.landings ? o.clicks / o.landings : 0,
      }))
      .sort((a, b) => b.landings - a.landings);
  };

  const byAdName = useMemo(() => buildBreakdown("ad_name"), [filtered]);
  const byReferrer = useMemo(() => buildBreakdown("referrer"), [filtered]);
  const byPath = useMemo(() => buildBreakdown("path"), [filtered]);
  const byDevice = useMemo(() => buildBreakdown("device"), [filtered]);
  const byBrowser = useMemo(() => buildBreakdown("browser"), [filtered]);
  const byOS = useMemo(() => buildBreakdown("os"), [filtered]);
  const byCountry = useMemo(() => buildBreakdown("timezone"), [filtered]); // proxy

  // ── campaign → adset → ad hierarchy ──────────────────────────────────
  const hierarchy = useMemo(() => buildHierarchy(filtered), [filtered]);

  return (
    <>
      <PageHeader
        eyebrow={
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
            Live tracker
          </p>
        }
        title="Landing-page events"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={syncNames}
              disabled={syncing}
              title={
                names.syncedAt
                  ? `Last synced ${relTime(names.syncedAt)}`
                  : "Fetch campaign / adset / ad names from Meta"
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm hover:bg-violet-100 disabled:opacity-50"
            >
              <Link2 size={12} className={syncing ? "animate-pulse" : ""} />
              {syncing ? "Syncing..." : names.syncedAt ? "Re-sync names" : "Sync names"}
            </button>
            <button
              onClick={() => fetchData()}
              disabled={loading || !sheetUrl}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={toggleAuto}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
                autoRefresh
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              <Activity size={12} />
              Auto {autoRefresh ? "on" : "off"}
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50"
            >
              <SettingsIcon size={12} />
              Settings
            </button>
          </div>
        }
      />

      <div className="space-y-5 pb-10">
        {showSettings && (
          <div className="surface p-5">
            <p className="text-sm font-semibold text-ink-900 mb-2">
              Apps Script Web-App URL
            </p>
            <p className="text-xs text-ink-600 mb-3">
              Deploy the Apps Script as a Web app (Anyone access) and paste
              the <code className="font-mono text-[11px] bg-ink-100 px-1 py-0.5 rounded">/exec</code> URL here.
              Saved server-side at <code className="font-mono text-[11px] bg-ink-100 px-1 py-0.5 rounded">data/tracker/settings.json</code> — shared across operators.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-mono text-ink-800 outline-none focus:border-sky-400"
              />
              <button
                onClick={saveUrl}
                disabled={savingSettings || draftUrl === sheetUrl}
                className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {savingSettings ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="mt-3 text-[11px] text-ink-500 space-y-0.5">
              {settingsUpdatedAt && (
                <p>Settings saved {relTime(settingsUpdatedAt)}.</p>
              )}
              {lastFetched && (
                <p>
                  Last fetched {lastFetched.toLocaleString()} · {rows.length} rows total
                </p>
              )}
            </div>
          </div>
        )}

        {settingsLoaded && !sheetUrl && !showSettings && (
          <div className="surface p-8 text-center">
            <p className="text-sm font-semibold text-ink-700">
              No Apps Script URL configured.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Open Settings
            </button>
          </div>
        )}

        {error && (
          <div className="surface border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <p className="font-semibold">Failed to load events</p>
            <p className="mt-1 font-mono">{error}</p>
            <p className="mt-2 text-red-700">
              Make sure the Apps Script Web app is deployed with access set to
              <span className="font-semibold"> Anyone</span> and the URL ends with{" "}
              <code className="font-mono">/exec</code>.
            </p>
          </div>
        )}

        {syncError && (
          <div className="surface border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <span className="font-semibold">Name sync failed:</span>{" "}
            <span className="font-mono">{syncError}</span>
          </div>
        )}

        {names.syncedAt && (
          <p className="text-[11px] text-ink-500 -mt-2 pl-1">
            Names synced from Meta{" "}
            {relTime(names.syncedAt)}
            {names.account ? ` · ${names.account}` : ""} ·{" "}
            {Object.keys(names.campaigns).length} campaigns ·{" "}
            {Object.keys(names.adsets).length} adsets ·{" "}
            {Object.keys(names.ads).length} ads
          </p>
        )}

        {sheetUrl && (
          <FiltersBar
            filters={filters}
            setFilter={setFilter}
            clearFilters={clearFilters}
            facets={facets}
            names={names}
            rowCount={filtered.length}
            totalCount={rows.length}
          />
        )}

        {sheetUrl && (
          <>
            <KpiStrip kpis={kpis} />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="min-w-0">
                <FunnelCard kpis={kpis} />
              </div>
              <div className="md:col-span-2 min-w-0">
                <DailyTrendCard daily={daily} />
              </div>
            </div>

            <HourCard hourly={hourly} />

            <HierarchyCard
              tree={hierarchy}
              names={names}
              onFocus={(level, id) => setFilter(level, id)}
              activeFilters={filters}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownCard title="By Ad name (sc)" rows={byAdName} idLabel="ad_name" />
              <BreakdownCard title="By Referrer" rows={byReferrer} idLabel="referrer" />
              <BreakdownCard title="By Landing path" rows={byPath} idLabel="path" />
              <BreakdownCard title="By Device" rows={byDevice} idLabel="device" />
              <BreakdownCard title="By Browser" rows={byBrowser} idLabel="browser" />
              <BreakdownCard title="By OS" rows={byOS} idLabel="os" />
              <BreakdownCard title="By Timezone" rows={byCountry} idLabel="timezone" />
            </div>

            <RawEventsTable rows={filtered} names={names} />
          </>
        )}
      </div>
    </>
  );
}

// ─── components ──────────────────────────────────────────────────────────

function FiltersBar({ filters, setFilter, clearFilters, facets, names, rowCount, totalCount }) {
  const set = (k, v) => setFilter(k, v);
  const clearAll = () => clearFilters();
  const active = Object.entries(filters).filter(
    ([k, v]) => v && !(k === "days" && v === "all"),
  ).length;
  const optWithName = (f, map) => ({
    value: f.value,
    label: `${labelFor(f.value, map)} (${f.count})`,
  });
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Filter size={14} className="text-ink-500" />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
          Filters
        </p>
        <p className="text-xs text-ink-500">
          {fmtInt(rowCount)} of {fmtInt(totalCount)} events
        </p>
        {active > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        <FilterSelect
          label="Range"
          value={filters.days}
          onChange={(v) => set("days", v)}
          options={[
            { value: "all", label: "All time" },
            { value: "1", label: "Last 24h" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
        <FilterSelect
          label="Event type"
          value={filters.type}
          onChange={(v) => set("type", v)}
          options={[
            { value: "", label: "All types" },
            ...facets.type.map((f) => ({
              value: f.value,
              label: `${f.value} (${f.count})`,
            })),
          ]}
        />
        <FilterSelect
          label="Campaign"
          value={filters.campaign}
          onChange={(v) => set("campaign", v)}
          options={[
            { value: "", label: "All campaigns" },
            ...facets.campaign.map((f) => optWithName(f, names.campaigns)),
          ]}
        />
        <FilterSelect
          label="Ad name (sc)"
          value={filters.adName}
          onChange={(v) => set("adName", v)}
          options={[
            { value: "", label: "All" },
            ...facets.adName.map((f) => ({
              value: f.value,
              label: `${f.value} (${f.count})`,
            })),
          ]}
        />
        <FilterSelect
          label="Adset"
          value={filters.adset}
          onChange={(v) => set("adset", v)}
          options={[
            { value: "", label: "All adsets" },
            ...facets.adset.map((f) => optWithName(f, names.adsets)),
          ]}
        />
        <FilterSelect
          label="Ad"
          value={filters.ad}
          onChange={(v) => set("ad", v)}
          options={[
            { value: "", label: "All ads" },
            ...facets.ad.map((f) => optWithName(f, names.ads)),
          ]}
        />
        <FilterSelect
          label="Device"
          value={filters.device}
          onChange={(v) => set("device", v)}
          options={[
            { value: "", label: "All devices" },
            ...facets.device.map((f) => ({
              value: f.value,
              label: `${f.value} (${f.count})`,
            })),
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-800 outline-none focus:border-sky-400 truncate"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiStrip({ kpis }) {
  const items = [
    { icon: Eye, label: "Landings", value: fmtInt(kpis.landings), accent: "sky" },
    { icon: MousePointerClick, label: "CTA clicks", value: fmtInt(kpis.clicks), accent: "emerald" },
    { icon: Gauge, label: "Total CTR", value: fmtPct(kpis.totalCTR), accent: "violet", sub: `${fmtPct(kpis.sessionCTR)} session-level` },
    { icon: Users, label: "Unique visitors", value: fmtInt(kpis.uniqVisitors), accent: "amber", sub: `${fmtInt(kpis.uniqSessions)} sessions` },
    { icon: Activity, label: "Avg time on page", value: fmtSec(kpis.avgTimeOnPage), accent: "rose", sub: `${fmtSec(kpis.avgTimeToClick)} to click` },
    { icon: Activity, label: "Avg scroll", value: kpis.avgScroll != null ? `${kpis.avgScroll.toFixed(1)}%` : "—", accent: "indigo" },
  ];
  const tint = {
    sky: "bg-sky-50 text-sky-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className="surface p-3">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${tint[it.accent]}`}>
              <it.icon size={12} />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {it.label}
            </p>
          </div>
          <p className="mt-1.5 text-xl font-bold text-ink-900 tracking-tight">{it.value}</p>
          {it.sub && <p className="text-[10px] text-ink-500">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function FunnelCard({ kpis }) {
  const max = Math.max(kpis.landings, 1);
  const stages = [
    { label: "Landings", value: kpis.landings, color: "bg-sky-500" },
    { label: "CTA clicks", value: kpis.clicks, color: "bg-emerald-500" },
  ];
  return (
    <div className="surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 mb-3">
        Funnel
      </p>
      <div className="space-y-2">
        {stages.map((s, i) => {
          const pct = (s.value / max) * 100;
          return (
            <div key={i}>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-xs font-semibold text-ink-700">{s.label}</p>
                <p className="text-xs text-ink-600">{fmtInt(s.value)}</p>
              </div>
              <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-ink-100 text-xs">
        <span className="text-ink-500">CTR (events): </span>
        <span className="font-semibold text-ink-800">{fmtPct(kpis.totalCTR)}</span>
        <span className="mx-2 text-ink-300">·</span>
        <span className="text-ink-500">CTR (sessions): </span>
        <span className="font-semibold text-ink-800">{fmtPct(kpis.sessionCTR)}</span>
      </div>
    </div>
  );
}

function DailyTrendCard({ daily }) {
  if (daily.length === 0) {
    return (
      <div className="surface p-4 h-full flex items-center justify-center text-xs text-ink-500">
        No timestamped events yet.
      </div>
    );
  }
  return (
    <div className="surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 mb-2">
        Daily landings vs CTA clicks
      </p>
      <div style={{ width: "100%", height: 220, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <ComposedChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <ReTooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar dataKey="landings" name="Landings" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="clicks" name="CTA clicks" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HourCard({ hourly }) {
  return (
    <div className="surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 mb-2">
        Hour-of-day (local browser time)
      </p>
      <div style={{ width: "100%", height: 200, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <ComposedChart data={hourly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <ReTooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar dataKey="landings" name="Landings" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            <Bar dataKey="clicks" name="CTA clicks" fill="#10b981" radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, idLabel, nameMap }) {
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState("landings");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = sortBy === "value" ? a.value : a[sortBy];
      const vb = sortBy === "value" ? b.value : b[sortBy];
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [rows, sortBy, sortDir]);

  const show = expanded ? sorted : sorted.slice(0, 6);
  const Sort = ({ k, label }) => (
    <button
      onClick={() => {
        if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else { setSortBy(k); setSortDir("desc"); }
      }}
      className="inline-flex items-center gap-0.5 hover:text-ink-900"
    >
      {label}
      {sortBy === k && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>
  );

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
          {title}
          <span className="ml-1.5 text-ink-400 normal-case font-medium">· {rows.length}</span>
        </p>
        {rows.length > 6 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            {expanded ? "Show less" : `Show all (${rows.length})`}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-500 py-4 text-center">No data</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-500 font-semibold">
                <th className="py-1.5 pr-2"><Sort k="value" label={idLabel} /></th>
                <th className="py-1.5 px-2 text-right"><Sort k="landings" label="Land" /></th>
                <th className="py-1.5 px-2 text-right"><Sort k="clicks" label="Clicks" /></th>
                <th className="py-1.5 px-2 text-right"><Sort k="sessions" label="Sess" /></th>
                <th className="py-1.5 px-2 text-right"><Sort k="ctr" label="CTR" /></th>
              </tr>
            </thead>
            <tbody>
              {show.map((r) => {
                const name = nameMap ? nameMap[String(r.value)] : null;
                return (
                <tr key={r.value} className="border-t border-ink-100">
                  <td
                    className="py-1.5 pr-2 max-w-[200px] truncate text-ink-800"
                    title={name ? `${name} · ${r.value}` : r.value}
                  >
                    {name ? (
                      <>
                        <span>{name}</span>
                        <span className="ml-1 text-[10px] font-mono text-ink-400">
                          {String(r.value).slice(-6)}
                        </span>
                      </>
                    ) : (
                      r.value
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-ink-700">{fmtInt(r.landings)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-emerald-700">{fmtInt(r.clicks)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-ink-700">{fmtInt(r.sessions)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-ink-700">{fmtPct(r.ctr)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RawEventsTable({ rows, names }) {
  const [limit, setLimit] = useState(50);
  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) =>
        String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
      ),
    [rows],
  );
  const show = ordered.slice(0, limit);
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
          Raw events
          <span className="ml-1.5 text-ink-400 normal-case font-medium">
            · showing {Math.min(limit, ordered.length)} of {ordered.length}
          </span>
        </p>
        {ordered.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 50)}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            Load 50 more
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead className="text-ink-500">
            <tr className="text-left">
              <th className="py-1.5 pr-2">Time</th>
              <th className="py-1.5 px-2">Type</th>
              <th className="py-1.5 px-2">Session</th>
              <th className="py-1.5 px-2">Campaign</th>
              <th className="py-1.5 px-2">Adset</th>
              <th className="py-1.5 px-2">Ad</th>
              <th className="py-1.5 px-2">Ad name</th>
              <th className="py-1.5 px-2">Device</th>
              <th className="py-1.5 px-2 text-right">On-page</th>
              <th className="py-1.5 px-2 text-right">Scroll</th>
              <th className="py-1.5 px-2">CTA</th>
            </tr>
          </thead>
          <tbody>
            {show.map((r, i) => {
              const ts = r.timestamp ? new Date(r.timestamp) : null;
              const tsStr = ts && !isNaN(ts)
                ? ts.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                : clean(r.timestamp);
              const typeColor =
                r.type === "PAGE_LANDED" ? "text-sky-700 bg-sky-50"
                : r.type === "CTA_CLICKED" ? "text-emerald-700 bg-emerald-50"
                : r.type === "PAGE_EXIT" ? "text-amber-700 bg-amber-50"
                : "text-ink-600 bg-ink-50";
              return (
                <tr key={i} className="border-t border-ink-100 hover:bg-ink-50/40">
                  <td className="py-1.5 pr-2 text-ink-700 whitespace-nowrap">{tsStr}</td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${typeColor}`}>
                      {clean(r.type) || "—"}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-ink-600 max-w-[100px] truncate" title={clean(r.session_id)}>
                    {clean(r.session_id).slice(0, 8) || "—"}
                  </td>
                  <td
                    className="py-1.5 px-2 text-ink-700 max-w-[160px] truncate"
                    title={`${labelFor(clean(r.utm_campaign), names?.campaigns)} · ${clean(r.utm_campaign)}`}
                  >
                    {clean(r.utm_campaign)
                      ? labelFor(clean(r.utm_campaign), names?.campaigns)
                      : "—"}
                  </td>
                  <td
                    className="py-1.5 px-2 text-ink-700 max-w-[160px] truncate"
                    title={`${labelFor(clean(r.utm_term), names?.adsets)} · ${clean(r.utm_term)}`}
                  >
                    {clean(r.utm_term)
                      ? labelFor(clean(r.utm_term), names?.adsets)
                      : "—"}
                  </td>
                  <td
                    className="py-1.5 px-2 text-ink-700 max-w-[160px] truncate"
                    title={`${labelFor(clean(r.utm_content), names?.ads)} · ${clean(r.utm_content)}`}
                  >
                    {clean(r.utm_content)
                      ? labelFor(clean(r.utm_content), names?.ads)
                      : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-ink-700 max-w-[120px] truncate" title={clean(r.ad_name)}>
                    {clean(r.ad_name) || "—"}
                  </td>
                  <td className="py-1.5 px-2 text-ink-600">
                    {clean(r.device) || "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right text-ink-700">
                    {r.time_on_page === "" || r.time_on_page == null ? "—" : `${r.time_on_page}s`}
                  </td>
                  <td className="py-1.5 px-2 text-right text-ink-700">
                    {r.scroll_depth === "" || r.scroll_depth == null ? "—" : `${r.scroll_depth}%`}
                  </td>
                  <td className="py-1.5 px-2 text-ink-700 max-w-[160px] truncate" title={clean(r.cta_url)}>
                    {r.cta_url ? (
                      <a href={r.cta_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-800">
                        <ExternalLink size={10} />
                        {(clean(r.cta_text) || clean(r.cta_url)).slice(0, 30)}
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Campaign → Adset → Ad hierarchy ────────────────────────────────────
// Aggregates landings / clicks / sessions at every level of the tree from
// the same events the rest of the dashboard already filtered, so users can
// drill in without bouncing between three separate breakdown cards.

function buildHierarchy(rows) {
  const tree = new Map();
  for (const r of rows) {
    const cid = clean(r.utm_campaign);
    if (!cid) continue;
    if (!tree.has(cid)) {
      tree.set(cid, {
        id: cid, landings: 0, clicks: 0, sessions: new Set(), adsets: new Map(),
      });
    }
    const c = tree.get(cid);
    const sid = clean(r.session_id);
    if (sid) c.sessions.add(sid);
    if (r.type === "PAGE_LANDED") c.landings++;
    else if (r.type === "CTA_CLICKED") c.clicks++;

    const aid = clean(r.utm_term);
    if (!aid) continue;
    if (!c.adsets.has(aid)) {
      c.adsets.set(aid, {
        id: aid, landings: 0, clicks: 0, sessions: new Set(), ads: new Map(),
      });
    }
    const a = c.adsets.get(aid);
    if (sid) a.sessions.add(sid);
    if (r.type === "PAGE_LANDED") a.landings++;
    else if (r.type === "CTA_CLICKED") a.clicks++;

    const adId = clean(r.utm_content);
    if (!adId) continue;
    if (!a.ads.has(adId)) {
      a.ads.set(adId, { id: adId, landings: 0, clicks: 0, sessions: new Set() });
    }
    const ad = a.ads.get(adId);
    if (sid) ad.sessions.add(sid);
    if (r.type === "PAGE_LANDED") ad.landings++;
    else if (r.type === "CTA_CLICKED") ad.clicks++;
  }
  const finalize = (node) => ({
    id: node.id,
    landings: node.landings,
    clicks: node.clicks,
    sessions: node.sessions.size,
    ctr: node.landings ? node.clicks / node.landings : 0,
  });
  return [...tree.values()]
    .map((c) => ({
      ...finalize(c),
      adsets: [...c.adsets.values()]
        .map((a) => ({
          ...finalize(a),
          ads: [...a.ads.values()]
            .map(finalize)
            .sort((x, y) => y.landings - x.landings),
        }))
        .sort((x, y) => y.landings - x.landings),
    }))
    .sort((x, y) => y.landings - x.landings);
}

function HierarchyCard({ tree, names, onFocus, activeFilters }) {
  const [expandedC, setExpandedC] = useState(() => new Set());
  const [expandedA, setExpandedA] = useState(() => new Set());

  const toggleC = (id) =>
    setExpandedC((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleA = (id) =>
    setExpandedA((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => {
    setExpandedC(new Set(tree.map((c) => c.id)));
    setExpandedA(new Set(tree.flatMap((c) => c.adsets.map((a) => a.id))));
  };
  const collapseAll = () => {
    setExpandedC(new Set());
    setExpandedA(new Set());
  };

  const totalLandings = tree.reduce((s, c) => s + c.landings, 0);

  if (tree.length === 0) {
    return (
      <div className="surface p-6 text-center text-xs text-ink-500">
        No campaign-attributed events in this slice. Either no rows carry
        a <code className="font-mono">utm_campaign</code> param yet, or
        the current filters exclude them all.
      </div>
    );
  }

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
            Campaign → Adset → Ad
          </p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {tree.length} campaigns ·{" "}
            {tree.reduce((s, c) => s + c.adsets.length, 0)} adsets ·{" "}
            {tree.reduce(
              (s, c) => s + c.adsets.reduce((t, a) => t + a.ads.length, 0),
              0,
            )}{" "}
            ads · click a row to expand
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            Expand all
          </button>
          <span className="text-ink-300">·</span>
          <button
            onClick={collapseAll}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700"
          >
            Collapse
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-500 font-semibold border-b border-ink-100">
              <th className="py-1.5 pr-2">Name</th>
              <th className="py-1.5 px-2 text-right">Landings</th>
              <th className="py-1.5 px-2 text-right">CTA clicks</th>
              <th className="py-1.5 px-2 text-right">Sessions</th>
              <th className="py-1.5 px-2 text-right">CTR</th>
              <th className="py-1.5 px-2 text-right">Share</th>
              <th className="py-1.5 px-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {tree.map((c) => {
              const cOpen = expandedC.has(c.id);
              const cActive = activeFilters?.campaign === c.id;
              return (
                <Fragment key={c.id}>
                  <Row
                    level={0}
                    id={c.id}
                    name={names?.campaigns?.[c.id]}
                    open={cOpen}
                    onToggle={() => toggleC(c.id)}
                    onFocus={() => onFocus?.("campaign", cActive ? "" : c.id)}
                    isActive={cActive}
                    metrics={c}
                    share={totalLandings ? c.landings / totalLandings : 0}
                    hasChildren={c.adsets.length > 0}
                  />
                  {cOpen &&
                    c.adsets.map((a) => {
                      const aOpen = expandedA.has(a.id);
                      const aActive = activeFilters?.adset === a.id;
                      return (
                        <Fragment key={a.id}>
                          <Row
                            level={1}
                            id={a.id}
                            name={names?.adsets?.[a.id]}
                            open={aOpen}
                            onToggle={() => toggleA(a.id)}
                            onFocus={() =>
                              onFocus?.("adset", aActive ? "" : a.id)
                            }
                            isActive={aActive}
                            metrics={a}
                            share={
                              c.landings ? a.landings / c.landings : 0
                            }
                            hasChildren={a.ads.length > 0}
                          />
                          {aOpen &&
                            a.ads.map((ad) => {
                              const adActive = activeFilters?.ad === ad.id;
                              return (
                                <Row
                                  key={ad.id}
                                  level={2}
                                  id={ad.id}
                                  name={names?.ads?.[ad.id]}
                                  open={false}
                                  onToggle={null}
                                  onFocus={() =>
                                    onFocus?.("ad", adActive ? "" : ad.id)
                                  }
                                  isActive={adActive}
                                  metrics={ad}
                                  share={
                                    a.landings
                                      ? ad.landings / a.landings
                                      : 0
                                  }
                                  hasChildren={false}
                                />
                              );
                            })}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  level,
  id,
  name,
  open,
  onToggle,
  onFocus,
  isActive,
  metrics,
  share,
  hasChildren,
}) {
  const indent = { 0: "pl-1", 1: "pl-7", 2: "pl-14" }[level];
  const bg =
    level === 0
      ? "bg-white"
      : level === 1
        ? "bg-ink-50/40"
        : "bg-ink-50/20";
  const focusTint = isActive ? "ring-1 ring-sky-300 ring-inset" : "";
  const label = name || id;
  return (
    <tr className={`border-t border-ink-100 ${bg} ${focusTint}`}>
      <td className={`py-1.5 pr-2 ${indent}`}>
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            <button
              onClick={onToggle}
              className="inline-flex h-4 w-4 items-center justify-center rounded text-ink-500 hover:bg-ink-100 hover:text-ink-800"
              aria-label={open ? "Collapse" : "Expand"}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="inline-flex h-4 w-4" />
          )}
          <span
            className={
              level === 0
                ? "font-semibold text-ink-900"
                : level === 1
                  ? "font-medium text-ink-800"
                  : "text-ink-700"
            }
            title={name ? `${name} · ${id}` : id}
          >
            {label}
          </span>
          {name && (
            <span className="text-[10px] font-mono text-ink-400">
              {String(id).slice(-6)}
            </span>
          )}
        </div>
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-ink-700">
        {fmtInt(metrics.landings)}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-emerald-700">
        {fmtInt(metrics.clicks)}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-ink-700">
        {fmtInt(metrics.sessions)}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-ink-700">
        {fmtPct(metrics.ctr)}
      </td>
      <td className="py-1.5 px-2 text-right">
        <ShareBar pct={share} />
      </td>
      <td className="py-1.5 px-1 text-right">
        <button
          onClick={onFocus}
          title={isActive ? "Clear filter" : "Filter dashboard to this row"}
          className={`inline-flex h-5 px-1.5 items-center rounded text-[10px] font-semibold transition-colors ${
            isActive
              ? "bg-sky-600 text-white"
              : "text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          }`}
        >
          {isActive ? "✓" : "Focus"}
        </button>
      </td>
    </tr>
  );
}

function ShareBar({ pct }) {
  const w = Math.min(100, Math.max(0, pct * 100));
  return (
    <div className="inline-flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full bg-sky-400" style={{ width: `${w}%` }} />
      </div>
      <span className="text-[10px] font-mono text-ink-600 w-9 text-right">
        {w.toFixed(0)}%
      </span>
    </div>
  );
}
