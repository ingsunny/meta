"use client";

// One uploaded report: editable title, KPI strip, trend + top-N charts,
// and a grouped, sortable, searchable table with CSV export.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { aggregate, totals, series, pickKpis, currencyOf, toCsv } from "@/lib/reports/aggregate";
import { makeFormatter, shortLabel } from "./format";

const PAGE = 50;

function Select({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg bg-white pl-3 pr-8 text-[13px] font-medium text-ink-900 ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
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

function ChartTip({ active, payload, label, fmt, col }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-pop">
      <p className="text-white/60">{label}</p>
      <p className="font-mono text-sm">{fmt(col, payload[0].value)}</p>
    </div>
  );
}

function prettyDate(d) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ReportView({ report, rows }) {
  const router = useRouter();
  const { columns } = report;
  const fmt = useMemo(() => makeFormatter(currencyOf(columns)), [columns]);

  const metrics = columns.filter((c) => c.type === "number");
  const dims = columns.filter((c) => c.type === "text" || (c.type === "date" && c.role !== "date_end"));
  const dateCol = columns.find((c) => c.type === "date" && c.role !== "date_end");
  const kpis = pickKpis(columns);

  const defaultDim =
    dims.find((c) => c.role === "campaign") || dims.find((c) => c.role === "adset") || dims.find((c) => c.role === "ad") || dims[0];
  const defaultMetric = metrics.find((c) => c.role === "spend") || metrics.find((c) => c.agg === "sum") || metrics[0];

  const [groupKey, setGroupKey] = useState(defaultDim?.key || "");
  const [metricKey, setMetricKey] = useState(defaultMetric?.key || "");
  const [sort, setSort] = useState({ key: defaultMetric?.key || "label", dir: "desc" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(report.name);

  const metricCol = metrics.find((c) => c.key === metricKey);
  const total = useMemo(() => totals(columns, rows), [columns, rows]);
  const grouped = useMemo(() => (groupKey ? aggregate(columns, rows, groupKey) : []), [columns, rows, groupKey]);
  const trend = useMemo(() => (dateCol && metricKey ? series(columns, rows, metricKey) : []), [columns, rows, dateCol, metricKey]);

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? grouped.filter((g) => g.label.toLowerCase().includes(needle)) : [...grouped];
    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sort.key === "label") return a.label.localeCompare(b.label) * dir;
      if (sort.key === "count") return (a.count - b.count) * dir;
      return ((a.values[sort.key] ?? -Infinity) - (b.values[sort.key] ?? -Infinity)) * dir;
    });
    return list;
  }, [grouped, q, sort]);

  const top = useMemo(
    () =>
      [...grouped]
        .filter((g) => g.values[metricKey] != null)
        .sort((a, b) => b.values[metricKey] - a.values[metricKey])
        .slice(0, 8)
        .map((g) => ({ label: g.label, value: g.values[metricKey] })),
    [grouped, metricKey],
  );

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const visible = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const groupCol = columns.find((c) => c.key === groupKey);

  const toggleSort = (key) => {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "label" ? "asc" : "desc" }));
  };

  const exportCsv = () => {
    const headers = [groupCol?.label || "Group", "Rows", ...metrics.map((m) => m.label)];
    const matrix = sorted.map((g) => [g.label, g.count, ...metrics.map((m) => g.values[m.key] ?? "")]);
    const blob = new Blob([toCsv(headers, matrix)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.name} - by ${groupCol?.label || "group"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveName = async () => {
    setEditing(false);
    if (!name.trim() || name === report.name) return setName(report.name);
    await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Delete “${report.name}”? This can't be undone.`)) return;
    await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
    router.push("/reports");
    router.refresh();
  };

  const SortIcon = ({ k }) => (sort.key === k ? sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null);

  return (
    <div className="pt-8">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-800">
        <ArrowLeft size={14} /> Reports
      </Link>

      {/* Header */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="font-display text-[34px] leading-tight text-ink-900 bg-white rounded-lg px-2 ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500 min-w-[280px]"
              />
              <button onClick={saveName} className="h-9 w-9 rounded-lg bg-ink-900 text-white flex items-center justify-center">
                <Check size={16} />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="group flex items-center gap-2 text-left">
              <h1 className="font-display text-[38px] leading-[1.05] text-ink-900">{name}</h1>
              <Pencil size={15} className="text-ink-300 group-hover:text-ink-600" />
            </button>
          )}
          <p className="mt-2 text-[13px] text-ink-500">
            {[
              report.filename,
              report.dateFrom && `${prettyDate(report.dateFrom)}${report.dateTo && report.dateTo !== report.dateFrom ? ` – ${prettyDate(report.dateTo)}` : ""}`,
              `${report.rowCount.toLocaleString()} rows`,
              `${metrics.length} metrics`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="h-9 px-3 rounded-lg bg-white text-sm font-medium text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 inline-flex items-center gap-1.5"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={remove}
            title="Delete report"
            className="h-9 w-9 rounded-lg bg-white text-ink-500 ring-1 ring-ink-200 hover:text-bad hover:bg-bad-soft inline-flex items-center justify-center"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* KPIs */}
      {kpis.length > 0 && (
        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpis.map((c) => (
            <button
              key={c.key}
              onClick={() => setMetricKey(c.key)}
              className={`surface p-4 text-left transition ${metricKey === c.key ? "ring-2 ring-brand-500" : "hover:shadow-lift"}`}
            >
              <p className="text-xs text-ink-500 truncate" title={c.label}>
                {shortLabel(c.label)}
              </p>
              <p className="mt-1.5 font-mono text-[22px] tracking-tight text-ink-900 tabular">{fmt(c, total.values[c.key], { short: true })}</p>
              <p className={`mt-0.5 text-[11px] text-ink-400 ${c.agg === "avg" ? "" : "invisible"}`}>blended</p>
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        {dims.length > 0 && (
          <Select
            label="Group by"
            value={groupKey}
            onChange={(v) => {
              setGroupKey(v);
              setPage(0);
            }}
            options={dims.map((d) => ({ value: d.key, label: d.label }))}
          />
        )}
        {metrics.length > 0 && (
          <Select
            label="Chart"
            value={metricKey}
            onChange={setMetricKey}
            options={metrics.map((m) => ({ value: m.key, label: shortLabel(m.label) }))}
          />
        )}
      </div>

      {/* Charts */}
      {metricCol && (
        <div className={`mt-4 grid gap-3 ${trend.length > 1 ? "xl:grid-cols-[1.4fr_1fr]" : ""}`}>
          {trend.length > 1 && (
            <div className="surface p-5">
              <p className="text-sm font-medium text-ink-900">{shortLabel(metricCol.label)} over time</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rv-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#5b5ff0" stopOpacity={0.25} />
                        <stop offset="1" stopColor="#5b5ff0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e7e5df" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#85817a" }}
                      tickFormatter={(d) => d.slice(5)}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fontSize: 11, fill: "#85817a" }}
                      tickFormatter={(v) => fmt(metricCol, v, { short: true })}
                    />
                    <Tooltip content={<ChartTip fmt={fmt} col={metricCol} />} />
                    <Area type="monotone" dataKey="value" stroke="#5b5ff0" strokeWidth={2} fill="url(#rv-area)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {top.length > 0 && groupCol && (
            <div className="surface p-5">
              <p className="text-sm font-medium text-ink-900">
                {shortLabel(metricCol.label)} <span className="text-ink-500 font-normal">· top {top.length} by {groupCol.label.toLowerCase()}</span>
              </p>
              <div className="mt-4" style={{ height: Math.max(160, top.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={150}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#45433f" }}
                      tickFormatter={(s) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)}
                    />
                    <Tooltip cursor={{ fill: "#f4f3ef" }} content={<ChartTip fmt={fmt} col={metricCol} />} />
                    <Bar dataKey="value" fill="#5b5ff0" radius={[0, 6, 6, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {groupCol && (
        <div className="mt-6 surface overflow-hidden">
          <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/70">
            <p className="text-sm font-medium text-ink-900">
              {sorted.length.toLocaleString()} {sorted.length === 1 ? "group" : "groups"}{" "}
              <span className="text-ink-500 font-normal">by {groupCol.label}</span>
            </p>
            <label className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={`Search ${groupCol.label.toLowerCase()}…`}
                className="h-9 w-64 rounded-lg bg-ink-50 pl-8 pr-3 text-[13px] ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-ink-50/80 text-ink-500">
                  <th className="sticky left-0 bg-ink-50 text-left font-medium px-5 py-2.5 min-w-[240px]">
                    <button onClick={() => toggleSort("label")} className="inline-flex items-center gap-1 hover:text-ink-900">
                      {groupCol.label} <SortIcon k="label" />
                    </button>
                  </th>
                  <th className="text-right font-medium px-3 py-2.5">
                    <button onClick={() => toggleSort("count")} className="inline-flex items-center gap-1 hover:text-ink-900">
                      Rows <SortIcon k="count" />
                    </button>
                  </th>
                  {metrics.map((m) => (
                    <th key={m.key} className="text-right font-medium px-3 py-2.5 whitespace-nowrap" title={m.label}>
                      <button onClick={() => toggleSort(m.key)} className="inline-flex items-center gap-1 hover:text-ink-900">
                        {shortLabel(m.label)} <SortIcon k={m.key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200/60">
                {visible.map((g) => (
                  <tr key={g.label} className="hover:bg-ink-50/60">
                    <td className="sticky left-0 bg-white px-5 py-2.5 text-ink-900 font-medium max-w-[360px] truncate" title={g.label}>
                      {groupCol.type === "date" && g.label !== "(blank)" ? prettyDate(g.label) : g.label}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-500 tabular">{g.count}</td>
                    {metrics.map((m) => (
                      <td key={m.key} className="px-3 py-2.5 text-right font-mono text-ink-800 tabular whitespace-nowrap">
                        {fmt(m, g.values[m.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50/80 font-medium border-t border-ink-200">
                  <td className="sticky left-0 bg-ink-50 px-5 py-2.5 text-ink-900">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular">{total.count}</td>
                  {metrics.map((m) => (
                    <td key={m.key} className="px-3 py-2.5 text-right font-mono text-ink-900 tabular whitespace-nowrap">
                      {fmt(m, total.values[m.key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {pages > 1 && (
            <div className="px-5 py-3 flex items-center justify-between border-t border-ink-200/70 text-[13px] text-ink-500">
              <span>
                Page {page + 1} of {pages}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 w-8 rounded-lg ring-1 ring-ink-200 bg-white flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 w-8 rounded-lg ring-1 ring-ink-200 bg-white flex items-center justify-center disabled:opacity-40"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-400">
        Blended metrics (CTR, CPM, CPC, cost per result, frequency, ROAS) are recalculated from totals, not averaged. Reach
        is summed across rows, so it may overcount people reached in more than one row.
      </p>
    </div>
  );
}
