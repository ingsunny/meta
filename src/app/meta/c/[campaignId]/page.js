"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  Wallet,
  Target,
  Activity,
  TrendingUp,
  Users,
  Eye,
} from "lucide-react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangeBadge } from "@/components/layout/DateRangePicker";
import { MetricCard, MetricGrid } from "@/components/metrics/MetricCard";
import { Avatar } from "@/components/metrics/Avatar";
import {
  ScoreBadge,
  StatusPill,
  ObjectiveTag,
} from "@/components/metrics/ScoreBadge";
import { ReconcileBadge } from "@/components/metrics/ReconcileBadge";
import { InsightStack } from "@/components/insights/InsightCallout";
import {
  CompareBar,
  CompareToggleButton,
} from "@/components/compare/CompareBar";
import { CompareDrawer } from "@/components/compare/CompareDrawer";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import { DownloadReportButton } from "@/components/report/DownloadButton";
import { useCompareSelection } from "@/components/compare/useCompareSelection";
import {
  ErrorState,
  EmptyState,
  SkeletonList,
} from "@/components/states/States";
import {
  ins,
  getScore,
  getResults,
  getResultLabel,
  getPrimaryKPI,
  getObjConfig,
} from "@/lib/meta/metrics";
import { isDelivering } from "@/lib/meta/status";
import { num, int, fmtNum, fmtPct } from "@/lib/meta/format";
import { reconcileSpend } from "@/lib/meta/reconcile";
import { buildCallouts } from "@/lib/meta/insights";
import { useAccount, useAppHref } from "@/components/account/AccountContext";

export default function CampaignDetailPage() {
  const { campaignId } = useParams();
  const params = useSearchParams();
  const range = params.get("range") || "maximum";
  const since = params.get("since");
  const until = params.get("until");
  const { accountId, fmtMoney } = useAccount();
  const appHref = useAppHref();

  const [state, setState] = useState({ status: "loading", campaign: null });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("score");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const compare = useCompareSelection({ max: 3 });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", campaign: null });
    const qs = new URLSearchParams({ range });
    if (accountId) qs.set("account", accountId);
    if (range === "custom" && since && until) {
      qs.set("since", since);
      qs.set("until", until);
    }
    fetch(`/api/meta/campaigns/${campaignId}?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => {
        if (!alive) return;
        if (!j.success) throw new Error("unsuccessful");
        console.log(j.data);
        setState({ status: "ok", campaign: j.data });
      })
      .catch(() => alive && setState({ status: "error", campaign: null }));
    return () => {
      alive = false;
    };
  }, [campaignId, range, since, until, accountId]);

  const campaign = state.campaign;
  const objective = campaign?.objective;
  const adsets = campaign?.adsets?.data || [];

  const filtered = useMemo(() => {
    return adsets.filter((a) => {
      if (statusFilter === "ACTIVE" && !isDelivering(a)) return false;
      if (statusFilter === "PAUSED" && isDelivering(a)) return false;
      if (query && !a.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [adsets, statusFilter, query]);

  const sorted = useMemo(() => {
    const scored = filtered.map((a) => ({
      ...a,
      _score: getScore(a, objective),
    }));
    return scored.sort((a, b) => {
      if (sortBy === "score") return b._score - a._score;
      if (sortBy === "spend") return num(ins(b).spend) - num(ins(a).spend);
      if (sortBy === "results")
        return getResults(b, objective) - getResults(a, objective);
      if (sortBy === "ctr") return num(ins(b).ctr) - num(ins(a).ctr);
      return 0;
    });
  }, [filtered, sortBy, objective]);

  const campaignInsight = ins(campaign);
  const reconciliation = useMemo(
    () =>
      campaign && adsets.length > 0 ? reconcileSpend(campaign, adsets) : null,
    [campaign, adsets],
  );
  const callouts = useMemo(
    () => (adsets.length ? buildCallouts(adsets, objective) : []),
    [adsets, objective],
  );

  const compareItems = adsets.filter((a) => compare.ids.includes(a.id));
  const objConf = campaign ? getObjConfig(objective) : null;
  const campaignScore = campaign ? getScore(campaign) : 0;
  const campaignKpi = campaign ? getPrimaryKPI(campaign) : null;
  const rangeQs = range !== "maximum" ? `?range=${range}` : "";

  return (
    <>
      <div className="pt-5">
        <Breadcrumbs
          items={[
            { label: "All campaigns", href: appHref("/meta") },
            { label: campaign?.name || "Loading…" },
          ]}
        />
      </div>

      {state.status === "loading" && (
        <div className="mt-10">
          <SkeletonList rows={5} />
        </div>
      )}

      {state.status === "error" && (
        <ErrorState
          title="Couldn't load this campaign"
          sub="The Meta API didn't return data. Try again or go back to the list."
        />
      )}

      {state.status === "ok" && campaign && (
        <>
          <section className="mt-5 surface-lift px-6 py-5">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex items-start gap-4 min-w-0">
                <Avatar name={campaign.name} node={campaign} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <ObjectiveTag objective={objective} config={objConf} />
                    <StatusPill node={campaign} />
                  </div>
                  <h1 className="text-[24px] font-bold tracking-tight text-ink-900 leading-tight">
                    {campaign.name}
                  </h1>
                  <p className="mt-1 text-xs text-ink-500">
                    Created{" "}
                    {new Date(campaign.created_time).toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}{" "}
                    · {adsets.length} ad{adsets.length === 1 ? "" : "s"} set
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap justify-end">
                <ScoreBadge score={campaignScore} size="lg" />
                <div className="flex flex-col items-end gap-2">
                  <RangeBadge
                    range={range}
                    dateStart={campaignInsight.date_start}
                    dateStop={campaignInsight.date_stop}
                  />
                  <DownloadReportButton
                    campaignId={campaign.id}
                    range={range}
                    variant="label"
                    label="Download report"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 mb-4">
            <MetricGrid cols={5}>
              <MetricCard
                label={campaignKpi.label}
                value={campaignKpi.raw != null ? fmtMoney(campaignKpi.raw) : "—"}
                icon={Target}
                tone="brand"
              />
              <MetricCard
                label="Spend"
                value={fmtMoney(num(campaignInsight.spend))}
                icon={Wallet}
              />
              <MetricCard
                label={getResultLabel(objective)}
                value={fmtNum(getResults(campaign))}
                icon={TrendingUp}
                accent="bg-emerald-50 text-emerald-600"
              />
              <MetricCard
                label="CTR"
                value={fmtPct(num(campaignInsight.ctr))}
                icon={Activity}
                accent="bg-violet-50 text-violet-600"
              />
              <MetricCard
                label="Frequency"
                value={`×${num(campaignInsight.frequency).toFixed(2)}`}
                icon={Users}
                accent={
                  num(campaignInsight.frequency) > 3.5
                    ? "bg-amber-50 text-amber-600"
                    : "bg-ink-100 text-ink-500"
                }
                tone={num(campaignInsight.frequency) > 3.5 ? "warn" : "default"}
              />
            </MetricGrid>
          </section>

          <section className="mb-4">
            {callouts.length > 0 ? (
              <InsightStack callouts={callouts} />
            ) : adsets.length > 0 ? (
              <div className="surface flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <TrendingUp size={14} />
                </div>
                <p className="text-sm text-ink-700">
                  Ad sets in this campaign are within healthy ranges.
                </p>
              </div>
            ) : null}
          </section>

          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-ink-200">
              <h2 className="text-[15px] font-bold text-ink-900 mr-1">
                Ad sets
                <span className="ml-2 text-xs font-semibold text-ink-500 tabular">
                  {sorted.length}
                </span>
              </h2>
              {reconciliation && (
                <ReconcileBadge
                  result={reconciliation}
                  childCount={adsets.length}
                  childLabel={adsets.length === 1 ? "ad set" : "ad sets"}
                />
              )}
              <div className="relative ml-auto w-full sm:w-64">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ad sets"
                  className="w-full bg-ink-50 text-sm rounded-full pl-9 pr-3 py-1.5 ring-1 ring-ink-200 focus:ring-brand-500 focus:bg-white outline-none transition-all text-ink-800 placeholder:text-ink-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-ink-200 bg-ink-50/40">
              <FilterPills
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { v: "ALL", l: "All" },
                  { v: "ACTIVE", l: "Active" },
                  { v: "PAUSED", l: "Paused" },
                ]}
              />
              <span className="h-4 w-px bg-ink-200" />
              <span className="text-xs font-semibold text-ink-500">Sort</span>
              <FilterPills
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { v: "score", l: "Score" },
                  { v: "spend", l: "Spend" },
                  { v: "results", l: "Results" },
                  { v: "ctr", l: "CTR" },
                ]}
              />
              <span className="ml-auto text-xs text-ink-500 tabular">
                {sorted.length} of {adsets.length}
              </span>
            </div>

            {sorted.length === 0 ? (
              <EmptyState
                title={
                  adsets.length === 0
                    ? "No ad sets in this campaign"
                    : "No ad sets match these filters"
                }
                sub={
                  adsets.length === 0
                    ? "This campaign was never built out with ad sets."
                    : "Try a different filter or clear the search."
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {sorted.map((a, idx) => (
                  <AdsetRow
                    key={a.id}
                    adset={a}
                    objective={objective}
                    campaignId={campaign.id}
                    rank={idx + 1}
                    compareActive={compare.ids.includes(a.id)}
                    compareDisabled={
                      !compare.ids.includes(a.id) && compare.isFull
                    }
                    onToggleCompare={() => compare.toggle(a.id)}
                    onView={() => setDetailItem(a)}
                  />
                ))}
              </ul>
            )}
          </section>

          <CompareBar
            count={compare.count}
            onOpen={() => setDrawerOpen(true)}
            onClear={compare.clear}
          />

          <CompareDrawer
            open={drawerOpen && compareItems.length >= 2}
            onClose={() => setDrawerOpen(false)}
            items={compareItems}
            objectiveOverride={objective}
            onRemove={compare.remove}
            title="Compare ad sets"
            itemKindLabel="ad sets"
          />

          <DetailDrawer
            open={!!detailItem}
            onClose={() => setDetailItem(null)}
            item={detailItem}
            kind="adset"
            objectiveOverride={objective}
          />
        </>
      )}
    </>
  );
}

function FilterPills({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 p-1">
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
              active
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-800"
            }`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function AdsetRow({
  adset,
  objective,
  campaignId,
  rank,
  compareActive,
  compareDisabled,
  onToggleCompare,
  onView,
}) {
  const i = ins(adset);
  const kpi = getPrimaryKPI(adset, objective);
  const results = getResults(adset, objective);
  const adsCount = adset.ads?.data?.length || 0;
  const { fmtMoney } = useAccount();
  const appHref = useAppHref();

  return (
    <li className="group hover:bg-brand-50/40 transition-colors">
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="text-[10px] font-bold text-ink-300 tabular w-5 shrink-0">
          {rank.toString().padStart(2, "0")}
        </span>

        <Avatar name={adset.name} node={adset} size="md" />
        <ScoreBadge score={adset._score} size="sm" />

        <div className="min-w-0 flex-1">
          <Link
            href={appHref(`/meta/c/${campaignId}/a/${adset.id}`)}
            className="inline-flex items-center gap-1 text-[15px] font-bold text-ink-900 hover:text-brand-600 transition-colors leading-tight"
          >
            <span className="line-clamp-1">{adset.name}</span>
            <ChevronRight
              size={14}
              className="text-ink-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0"
            />
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill node={adset} />
            <span className="text-[11px] font-medium text-ink-500">
              {adsCount} {adsCount === 1 ? "ad" : "ads"}
            </span>
          </div>
        </div>

        <div className="hidden lg:grid grid-cols-5 gap-5 items-center">
          <Metric
            label={kpi.label}
            value={kpi.raw != null ? fmtMoney(kpi.raw) : "—"}
            highlight
          />
          <Metric label={getResultLabel(objective)} value={fmtNum(results)} />
          <Metric label="Spend" value={fmtMoney(num(i.spend))} />
          <Metric label="CTR" value={fmtPct(num(i.ctr))} />
          <Metric label="Impr." value={fmtNum(int(i.impressions))} />
        </div>

        <button
          onClick={onView}
          title="View full details"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition-all"
        >
          <Eye size={14} strokeWidth={2.25} />
          <span className="sr-only">View details</span>
        </button>
        <CompareToggleButton
          active={compareActive}
          disabled={compareDisabled}
          onClick={onToggleCompare}
        />
      </div>
    </li>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div className="text-right min-w-14">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </p>
      <p
        className={`text-sm font-bold tabular leading-tight mt-0.5 ${
          highlight ? "text-brand-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
