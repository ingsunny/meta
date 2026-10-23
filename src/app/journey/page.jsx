"use client";

// /journey — Click ↔ Conversion mapping dashboard.
//
// Pairs the Fuse click report with the offline conversion report and
// surfaces each visitor's full timeline. Built around three views in
// one page: the top "pulse" (KPIs + daily click vs conversion ribbon),
// the filter strip, and a sortable / searchable journey table. Clicking
// a row opens a side drawer with the full chronological timeline.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Search,
  Filter as FilterIcon,
  Download,
  Sparkles,
  MousePointerClick,
  Target,
  DollarSign,
  Hourglass,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  CheckCircle2,
  Globe,
  Monitor,
  Upload,
  FileText,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";

// ── helpers ────────────────────────────────────────────────────────────
function fmtInt(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
}
function fmtMoney(n, ccy = "USD") {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  }).format(Number(n));
}
function fmtPct(n) {
  if (!isFinite(n) || n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtDur(hours) {
  if (hours == null || !isFinite(hours)) return "—";
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
function fmtTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── page ───────────────────────────────────────────────────────────────
export default function JourneyPage() {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [filters, setFilters] = useState({
    search: "", country: "", device: "", matched: "",
  });
  const [sort, setSort] = useState({ col: "last_click_at", dir: "desc" });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [limit, setLimit] = useState(100);
  const [drawer, setDrawer] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    fetch("/api/journey/summary")
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.success) setSummary(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSummary(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  useEffect(() => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    qs.set("sort", sort.col);
    qs.set("dir", sort.dir);
    qs.set("limit", String(limit));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoadingRows(true);
      fetch(`/api/journey/rows?${qs}`)
        .then((r) => r.json())
        .then((j) => {
          if (j?.success) {
            setRows(j.rows || []);
            setTotal(j.total || 0);
          }
        })
        .finally(() => setLoadingRows(false));
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [filters, sort, limit, refreshTick]);

  const downloadExport = async (format) => {
    setExporting(true);
    try {
      const qs = format === "customer_file"
        ? "?format=customer_file&onlyConverted=1"
        : "?format=offline_events";
      const r = await fetch(`/api/journey/export-lookalike${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "customer_file"
          ? "meta-customer-file.xlsx"
          : "meta-offline-events.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${e.message || e}`);
    } finally {
      setExporting(false);
    }
  };

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () =>
    setFilters({ search: "", country: "", device: "", matched: "" });
  const activeFilterCount =
    Object.entries(filters).filter(([, v]) => v).length;

  const daily = useMemo(() => {
    if (!summary) return [];
    const m = new Map();
    for (const r of summary.dailyClicks || []) {
      m.set(r.date, { date: r.date, clicks: r.clicks, convs: 0, revenue: 0 });
    }
    for (const r of summary.dailyConvs || []) {
      const cur = m.get(r.date) || { date: r.date, clicks: 0, convs: 0, revenue: 0 };
      cur.convs = r.convs;
      cur.revenue = r.revenue;
      m.set(r.date, cur);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [summary]);

  return (
    <>
      <PageHeader
        eyebrow={
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            New discovery · click ↔ conversion
          </p>
        }
        title="User journey"
        sub="One row per unique visitor (joined by session IP). Fuse click report adds fbclid + click-side device & geo; conv report is the source of truth for the conversion events they triggered. Click a row to see the full chronological story."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              title="Upload fresh paychat + conv CSVs. Paychat times will be converted IST → UTC, conv times PST/PDT → UTC."
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50"
            >
              <Upload size={12} />
              Import CSVs
            </button>
            <button
              onClick={() => downloadExport("offline_events")}
              disabled={exporting}
              title="Meta Offline Events format — one row per conversion event with client_ip_address, client_user_agent, fbc, hashed ct/st/country, madid. Upload via Events Manager → Offline Event Set."
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-linear-to-br from-violet-500 to-fuchsia-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-violet-600 hover:to-fuchsia-700 disabled:opacity-60"
            >
              <Download size={12} />
              {exporting ? "Building…" : "Offline Events (.xlsx)"}
            </button>
            <button
              onClick={() => downloadExport("customer_file")}
              disabled={exporting}
              title="Meta Customer File format — one row per unique converted visitor. Upload via Audiences → Create Custom Audience → Customer List."
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50 disabled:opacity-60"
            >
              <Download size={12} />
              Customer File (.xlsx)
            </button>
          </div>
        }
      />

      <div className="space-y-5 pb-12">
        <PulseHeader summary={summary} loading={loadingSummary} daily={daily} />

        <FilterStrip
          filters={filters}
          setFilter={setFilter}
          clearFilters={clearFilters}
          facets={summary?.facets}
          activeCount={activeFilterCount}
          total={total}
        />

        <JourneyTable
          rows={rows}
          loading={loadingRows}
          sort={sort}
          setSort={setSort}
          onOpen={(r) => setDrawer(r)}
          limit={limit}
          setLimit={setLimit}
          total={total}
        />

        {summary && (
          <div className="grid gap-4 md:grid-cols-3">
            <BreakdownCard
              icon={Globe}
              title="Top cities"
              rows={summary.topCities || []}
              labelKey="city"
              accent="sky"
            />
            <BreakdownCard
              icon={Target}
              title="Top states"
              rows={summary.topStates || []}
              labelKey="state"
              accent="violet"
            />
            <BreakdownCard
              icon={Monitor}
              title="By device"
              rows={summary.topDevices || []}
              labelKey="device"
              accent="emerald"
            />
          </div>
        )}
      </div>

      {drawer && (
        <JourneyDrawer
          row={drawer}
          onClose={() => setDrawer(null)}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            setRefreshTick((t) => t + 1);
          }}
        />
      )}
    </>
  );
}

// ─── Pulse header ───────────────────────────────────────────────────────
function PulseHeader({ summary, loading, daily }) {
  const matchRate =
    summary && summary.uniqueIps
      ? summary.matchedUsers / summary.uniqueIps
      : 0;
  const convPerUser =
    summary && summary.matchedUsers
      ? summary.convCount / summary.matchedUsers
      : 0;

  return (
    <div className="rounded-2xl bg-linear-to-br from-violet-950 via-violet-900 to-fuchsia-900 p-6 text-white shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} className="text-fuchsia-300" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
          The pulse
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <PulseStat
          icon={MousePointerClick}
          label="Unique users"
          value={loading ? "…" : fmtInt(summary?.uniqueIps)}
          sub={summary && `${fmtInt(summary.clickCount)} total clicks`}
          accent="from-sky-400/30 to-sky-400/0"
        />
        <PulseStat
          icon={Target}
          label="Conversion events"
          value={loading ? "…" : fmtInt(summary?.convCount)}
          sub={summary && `${fmtInt(summary.matchedUsers)} matched users`}
          accent="from-emerald-400/30 to-emerald-400/0"
        />
        <PulseStat
          icon={Zap}
          label="Match rate (IP)"
          value={loading ? "…" : fmtPct(matchRate)}
          sub={`${convPerUser.toFixed(1)} events / matched user`}
          accent="from-amber-400/30 to-amber-400/0"
        />
        <PulseStat
          icon={DollarSign}
          label="Tracked revenue"
          value={loading ? "…" : fmtMoney(summary?.revenue)}
          sub={
            summary?.convCount
              ? `${fmtMoney((summary?.revenue || 0) / summary.convCount)} avg / event`
              : null
          }
          accent="from-fuchsia-400/30 to-fuchsia-400/0"
        />
        <PulseStat
          icon={Hourglass}
          label="Avg time-to-conv"
          value={loading ? "…" : fmtDur(summary?.avgLatencyHours)}
          sub="Click → first conversion"
          accent="from-rose-400/30 to-rose-400/0"
        />
      </div>

      {daily.length > 1 && (
        <div className="mt-5 rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200 mb-1.5">
            Daily clicks vs conversions
          </p>
          <div style={{ width: "100%", height: 140, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <ComposedChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#c4b5fd" }} />
                <YAxis tick={{ fontSize: 9, fill: "#c4b5fd" }} />
                <ReTooltip
                  contentStyle={{
                    background: "#1e1b4b",
                    border: "1px solid #6d28d9",
                    borderRadius: 8,
                    fontSize: 11,
                    color: "#fff",
                  }}
                  labelStyle={{ color: "#c4b5fd" }}
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  name="Clicks"
                  stroke="#38bdf8"
                  fill="rgba(56,189,248,0.25)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="convs"
                  name="Conversions"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function PulseStat({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className={`relative rounded-xl bg-linear-to-br ${accent} ring-1 ring-white/10 p-4 overflow-hidden`}>
      <div className="flex items-center gap-1.5 text-white/70 mb-2">
        <Icon size={12} />
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-white/60">{sub}</p>}
    </div>
  );
}

// ─── Filter strip ───────────────────────────────────────────────────────
function FilterStrip({ filters, setFilter, clearFilters, facets, activeCount, total }) {
  return (
    <div className="surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterIcon size={14} className="text-ink-500" />
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Search IP, fbclid, transaction id, city…"
            className="w-full rounded-md border border-ink-200 bg-white pl-7 pr-3 py-1.5 text-xs text-ink-800 outline-none focus:border-violet-400"
          />
        </div>
        <ChipSelect
          value={filters.matched}
          onChange={(v) => setFilter("matched", v)}
          options={[
            { value: "", label: "All visitors" },
            { value: "yes", label: "Matched (converted)" },
            { value: "no", label: "Unmatched (no conv)" },
          ]}
        />
        <ChipSelect
          value={filters.country}
          onChange={(v) => setFilter("country", v)}
          options={[
            { value: "", label: "Country: all" },
            ...(facets?.countries || []).map((v) => ({ value: v, label: v })),
          ]}
        />
        <ChipSelect
          value={filters.device}
          onChange={(v) => setFilter("device", v)}
          options={[
            { value: "", label: "Device: all" },
            ...(facets?.devices || []).map((v) => ({ value: v, label: v })),
          ]}
        />
        {activeCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-[11px] font-semibold text-violet-700 hover:text-violet-800"
          >
            Clear ({activeCount})
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-500">
          {fmtInt(total)} journeys
        </span>
      </div>
    </div>
  );
}

function ChipSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-700 outline-none focus:border-violet-400 max-w-[160px] truncate"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Journey table ──────────────────────────────────────────────────────
function JourneyTable({ rows, loading, sort, setSort, onOpen, limit, setLimit, total }) {
  const headers = [
    { key: "last_click_at", label: "Last seen" },
    { key: null, label: "Visitor" },
    { key: "city", label: "City" },
    { key: "country", label: "State / country" },
    { key: "device", label: "Device" },
    { key: "click_count", label: "Clicks", align: "right" },
    { key: "conv_count", label: "Conv events", align: "right" },
    { key: "conv_revenue", label: "Revenue", align: "right" },
    { key: "latency", label: "Latency", align: "right" },
    { key: null, label: "Funnel" },
  ];

  const click = (k) => {
    if (!k) return;
    setSort((s) =>
      s.col === k ? { col: k, dir: s.dir === "asc" ? "desc" : "asc" } : { col: k, dir: "desc" },
    );
  };

  return (
    <div className="surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
          Journeys
          <span className="ml-1.5 text-ink-400 normal-case font-medium">
            · showing {fmtInt(rows.length)} of {fmtInt(total)}
          </span>
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-ink-500">Page size</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[11px] text-ink-700 outline-none"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-ink-50/60 sticky top-0">
            <tr className="text-left text-ink-500 font-semibold">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 ${h.align === "right" ? "text-right" : ""} ${h.key ? "cursor-pointer hover:text-ink-900" : ""} whitespace-nowrap`}
                  onClick={() => click(h.key)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {h.label}
                    {sort.col === h.key && (sort.dir === "asc"
                      ? <ChevronUp size={10} />
                      : <ChevronDown size={10} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-ink-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="py-8 text-center text-ink-400">
                  No journeys match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <JourneyRow key={r.ip} row={r} onOpen={() => onOpen(r)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JourneyRow({ row, onOpen }) {
  const matched = row.conv_count > 0;
  const events = row.conv_events ? row.conv_events.split(" › ") : [];
  return (
    <tr
      onClick={onOpen}
      className={`border-t border-ink-100 cursor-pointer hover:bg-violet-50/40 transition-colors ${matched ? "" : "opacity-60"}`}
    >
      <td className="px-3 py-2 text-ink-700 whitespace-nowrap">
        <p className="font-medium">{fmtTime(row.last_click_at)}</p>
        {row.first_click_at && row.first_click_at !== row.last_click_at && (
          <p className="text-[10px] text-ink-400">
            first {fmtTime(row.first_click_at)}
          </p>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-ink-700 max-w-[200px]">
        <p
          className="font-semibold text-ink-900 truncate flex items-center gap-1.5"
          title={row.ip}
        >
          {matched ? (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ) : (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-300" />
          )}
          {row.ip || "—"}
        </p>
        {row.fbclid && (
          <p
            className="text-[10px] text-ink-400 truncate pl-3.5"
            title={row.fbclid}
          >
            fbclid · {row.fbclid.slice(0, 18)}…
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-ink-800">
        {row.city || "—"}
      </td>
      <td className="px-3 py-2 text-ink-700">
        {row.state || "—"}
        <p className="text-[10px] text-ink-400">{row.country || ""}</p>
      </td>
      <td className="px-3 py-2 text-ink-700">
        {row.device_type || "—"}
        <p className="text-[10px] text-ink-400">
          {[row.device_os, row.device_os_version].filter(Boolean).join(" ")}
        </p>
      </td>
      <td className="px-3 py-2 text-right font-mono text-ink-800">
        {row.click_count}
      </td>
      <td className="px-3 py-2 text-right font-mono">
        {matched ? (
          <span className="text-emerald-700 font-semibold">{row.conv_count}</span>
        ) : (
          <span className="text-ink-300">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-ink-800">
        {row.conv_revenue > 0 ? fmtMoney(row.conv_revenue) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-ink-700">
        {row.latency_minutes != null
          ? fmtLatency(row.latency_minutes)
          : "—"}
      </td>
      <td className="px-3 py-2">
        {events.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 max-w-[240px]">
            {events.slice(0, 3).map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700"
              >
                {e}
              </span>
            ))}
            {events.length > 3 && (
              <span className="text-[10px] text-ink-400">+{events.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-ink-300 italic">no conv</span>
        )}
      </td>
    </tr>
  );
}

function fmtLatency(min) {
  if (min == null || !isFinite(min)) return "—";
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 1440).toFixed(1)}d`;
}

// ─── Breakdown card ─────────────────────────────────────────────────────
function BreakdownCard({ icon: Icon, title, rows, labelKey, accent }) {
  const max = Math.max(1, ...rows.map((r) => r.users));
  const tint = {
    violet: "from-violet-500 to-fuchsia-500",
    sky: "from-sky-500 to-cyan-500",
    emerald: "from-emerald-500 to-lime-500",
  }[accent];
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon size={14} className="text-ink-500" />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-600">
          {title}
        </p>
      </div>
      <div className="space-y-2">
        {rows.slice(0, 8).map((r, i) => {
          const w = (r.users / max) * 100;
          const rate = r.users ? r.convs / r.users : 0;
          return (
            <div key={i}>
              <div className="flex items-baseline justify-between mb-0.5">
                <p className="text-xs font-medium text-ink-800 truncate max-w-[150px]" title={r[labelKey]}>
                  {r[labelKey] || "(none)"}
                </p>
                <p className="text-[10px] font-mono text-ink-600">
                  {fmtInt(r.users)} users · <span className="text-emerald-700">{fmtPct(rate)}</span>
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div className={`h-full bg-linear-to-r ${tint}`} style={{ width: `${w}%` }} />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-xs text-ink-400 text-center py-2">No data</p>
        )}
      </div>
    </div>
  );
}

// ─── Journey drawer ─────────────────────────────────────────────────────
function JourneyDrawer({ row, onClose }) {
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/journey/by-ip/${encodeURIComponent(row.ip)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.success) setJourney(j); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [row.ip]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="ml-auto w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto relative">
        <div className="sticky top-0 z-10 bg-white border-b border-ink-200 px-5 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
              Visitor journey
            </p>
            <p className="text-sm font-semibold text-ink-900 truncate mt-0.5 font-mono">
              {row.ip}
            </p>
            {row.fbclid && (
              <p
                className="text-[10px] font-mono text-ink-400 truncate mt-0.5"
                title={row.fbclid}
              >
                fbclid · {row.fbclid}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-ink-100 text-ink-500"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && <p className="text-xs text-ink-400">Loading timeline…</p>}
          {!loading && journey && (
            <>
              <VisitorProfile journey={journey} />
              <FactGrid journey={journey} />
              <TimelineList timeline={journey.timeline} />
              <RawTables clicks={journey.clicks} convs={journey.convs} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VisitorProfile({ journey }) {
  const p = journey.profile;
  if (!p) return null;
  const lines = [
    {
      label: "Geo",
      value:
        [p.city, p.state, p.country].filter(Boolean).join(", ") || "—",
    },
    {
      label: "Device",
      value:
        [p.device_brand, p.device_os, p.device_os_version]
          .filter(Boolean)
          .join(" ") || p.device_type || "—",
    },
    { label: "Browser", value: p.browser || "—" },
    { label: "Language", value: p.language || "—" },
    { label: "Carrier", value: p.carrier || "—" },
    { label: "ISP", value: p.isp || "—" },
  ];
  const devices = journey.totals.distinctDevices || [];
  return (
    <div className="rounded-xl bg-linear-to-br from-violet-50 to-fuchsia-50 ring-1 ring-violet-200 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 mb-2">
        Visitor profile · from conv report
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="text-ink-500">{l.label}: </span>
            <span className="text-ink-800 font-medium">{l.value}</span>
          </div>
        ))}
      </div>
      {devices.length > 1 && (
        <p className="mt-2 text-[10px] text-amber-700 font-semibold">
          ⚠ Multi-device visitor — also seen on:{" "}
          {devices.filter((d) => d !== p.device_type).join(", ")}
        </p>
      )}
    </div>
  );
}

function FactGrid({ journey }) {
  const { totals, clicks, convs } = journey;
  const firstClick = clicks[0];
  const firstConv = convs[0];
  const delta =
    firstClick?.session_time && firstConv?.conv_date
      ? (new Date(firstConv.conv_date) - new Date(firstClick.session_time)) / 3600000
      : null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Fact label="Clicks" value={fmtInt(totals.clicks)} accent="sky" />
      <Fact label="Conv events" value={fmtInt(totals.convs)} accent="violet" />
      <Fact label="Revenue" value={fmtMoney(totals.revenue)} accent="emerald" />
      <Fact label="Time-to-conv" value={fmtDur(delta)} accent="amber" />
    </div>
  );
}

function Fact({ label, value, accent }) {
  const tint = {
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  }[accent];
  return (
    <div className={`rounded-lg ${tint} px-3 py-2`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
    </div>
  );
}

function TimelineList({ timeline }) {
  if (!timeline?.length) {
    return <p className="text-xs text-ink-400">No timeline events.</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 mb-3">
        Timeline
      </p>
      <ol className="relative space-y-3 pl-4">
        <span className="absolute left-1.5 top-2 bottom-2 w-px bg-ink-200" />
        {timeline.map((t, i) => {
          const isClick = t.kind === "click";
          return (
            <li key={i} className="relative">
              <span
                className={`absolute -left-3 top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                  isClick ? "bg-sky-500" : "bg-emerald-500"
                }`}
              />
              <div className="rounded-lg bg-ink-50/60 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-semibold text-ink-800">
                    {isClick ? (
                      <span className="inline-flex items-center gap-1 text-sky-700">
                        <MousePointerClick size={11} /> {t.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 size={11} /> {t.label}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-mono text-ink-500">{fmtTime(t.at)}</p>
                </div>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-ink-600">
                  {t.location && (
                    <p><span className="text-ink-400">Geo:</span> {t.location}</p>
                  )}
                  {t.ip && (
                    <p className="font-mono"><span className="text-ink-400">IP:</span> {t.ip}</p>
                  )}
                  {t.revenue != null && Number(t.revenue) > 0 && (
                    <p><span className="text-ink-400">Revenue:</span> {fmtMoney(t.revenue, t.currency || "USD")}</p>
                  )}
                  {t.offer && (
                    <p><span className="text-ink-400">Offer:</span> {t.offer}</p>
                  )}
                  {t.status && isClick && (
                    <p><span className="text-ink-400">Status:</span> {t.status}</p>
                  )}
                </div>
                {t.ua && (
                  <p
                    className="mt-1 text-[10px] font-mono text-ink-400 truncate"
                    title={t.ua}
                  >
                    {t.ua}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RawTables({ clicks, convs }) {
  const [open, setOpen] = useState(false);
  const total = clicks.length + convs.length;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900"
      >
        <Layers size={12} />
        Raw records ({total})
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[11px] font-mono">
          {clicks.map((c, i) => (
            <Block
              key={`c-${c.id}`}
              title={`click ${i + 1} · ${fmtTime(c.session_time)}`}
              obj={c}
            />
          ))}
          {convs.map((c, i) => (
            <Block
              key={`v-${c.id}`}
              title={`conv ${i + 1} · ${fmtTime(c.conv_date)} · ${c.event_name || ""}`}
              obj={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ title, obj }) {
  const entries = Object.entries(obj || {}).filter(
    ([, v]) => v != null && v !== "",
  );
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50/40">
      <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 border-b border-ink-100">
        {title}
      </p>
      <div className="px-2.5 py-1.5 max-h-48 overflow-y-auto">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2 py-0.5">
            <span className="text-ink-400 min-w-[120px]">{k}</span>
            <span className="text-ink-700 break-all">{String(v).slice(0, 200)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Import modal ───────────────────────────────────────────────────────
// Two file inputs (paychat + conv). Either or both can be uploaded.
// Server-side, paychat times are converted IST → UTC and conv times
// PST/PDT → UTC before insertion. Re-uploading the same CSV is idempotent.

function ImportModal({ onClose, onDone }) {
  const [fuse, setFuse] = useState(null);
  const [conv, setConv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!fuse && !conv) {
      setError("Select at least one CSV.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    if (fuse) fd.append("fuse", fuse);
    if (conv) fd.append("conv", conv);
    try {
      const r = await fetch("/api/journey/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setResult(j);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    if (result) onDone();
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
              Import
            </p>
            <p className="text-sm font-semibold text-ink-900 mt-0.5">
              Upload paychat + conv reports
            </p>
          </div>
          <button
            onClick={close}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-ink-100 text-ink-500"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <FilePicker
            label="Paychat (Fuse Click Report)"
            note="Times will be converted IST → UTC on the server."
            accept=".csv,text/csv"
            file={fuse}
            onChange={setFuse}
            tint="violet"
          />
          <FilePicker
            label="Conv Report"
            note="Times will be converted PST/PDT → UTC on the server (DST-aware)."
            accept=".csv,text/csv"
            file={conv}
            onChange={setConv}
            tint="emerald"
          />

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
              <p className="font-semibold">Import complete.</p>
              {result.fuse && (
                <ResultLine
                  label="Paychat"
                  filename={result.fuse.filename}
                  rowsRead={result.fuse.rowsRead}
                  inserted={result.fuse.inserted}
                  error={result.fuse.error}
                />
              )}
              {result.conv && (
                <ResultLine
                  label="Conv"
                  filename={result.conv.filename}
                  rowsRead={result.conv.rowsRead}
                  inserted={result.conv.inserted}
                  error={result.conv.error}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 bg-ink-50/60 rounded-b-2xl">
          <button
            onClick={close}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100 disabled:opacity-50"
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={submit}
              disabled={busy || (!fuse && !conv)}
              className="rounded-md bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Importing…" : "Upload"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilePicker({ label, note, accept, file, onChange, tint }) {
  const inputRef = useRef(null);
  const tints = {
    violet: "border-violet-200 bg-violet-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
  };
  return (
    <div className={`rounded-lg border ${tints[tint]} p-3`}>
      <p className="text-xs font-semibold text-ink-800">{label}</p>
      <p className="text-[11px] text-ink-500 mt-0.5">{note}</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
        >
          <FileText size={11} />
          Choose CSV
        </button>
        {file && (
          <span
            className="text-[11px] text-ink-600 truncate flex-1"
            title={file.name}
          >
            {file.name}{" "}
            <span className="text-ink-400">
              ({(file.size / 1024).toFixed(0)} KB)
            </span>
          </span>
        )}
        {file && (
          <button
            onClick={() => onChange(null)}
            className="text-ink-400 hover:text-ink-700"
            title="Clear"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </div>
  );
}

function ResultLine({ label, filename, rowsRead, inserted, error }) {
  if (error) {
    return (
      <p>
        <span className="font-semibold">{label}:</span> {error}
      </p>
    );
  }
  return (
    <p>
      <span className="font-semibold">{label}</span> ({filename}):{" "}
      {fmtInt(inserted)} rows upserted from {fmtInt(rowsRead)} parsed.
    </p>
  );
}
