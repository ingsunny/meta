"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ImageOff,
  Search,
  Wallet,
  Target,
  Activity,
  TrendingUp,
  Users,
  Eye,
} from "lucide-react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
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
import { CompareBar, CompareToggleButton } from "@/components/compare/CompareBar";
import { CompareDrawer } from "@/components/compare/CompareDrawer";
import { DetailDrawer } from "@/components/detail/DetailDrawer";
import { useCompareSelection } from "@/components/compare/useCompareSelection";
import { ErrorState, EmptyState, SkeletonList } from "@/components/states/States";
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

export default function AdsetDetailPage() {
  const { campaignId, adsetId } = useParams();
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
        setState({ status: "ok", campaign: j.data });
      })
      .catch(() => alive && setState({ status: "error", campaign: null }));
    return () => {
      alive = false;
    };
  }, [campaignId, range, since, until, accountId]);

  const campaign = state.campaign;
  const objective = campaign?.objective;
  const adset = campaign?.adsets?.data?.find((a) => a.id === adsetId);
  const ads = adset?.ads?.data || [];
  const objConf = campaign ? getObjConfig(objective) : null;

  const filtered = useMemo(() => {
    return ads.filter((a) => {
      if (statusFilter === "ACTIVE" && !isDelivering(a)) return false;
      if (statusFilter === "PAUSED" && isDelivering(a)) return false;
      if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [ads, statusFilter, query]);

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

  const adsetInsight = ins(adset);
  const reconciliation = useMemo(
    () => (adset && ads.length > 0 ? reconcileSpend(adset, ads) : null),
    [adset, ads],
  );
  const callouts = useMemo(
    () => (ads.length ? buildCallouts(ads, objective) : []),
    [ads, objective],
  );

  const compareItems = ads.filter((a) => compare.ids.includes(a.id));
  const adsetScore = adset ? getScore(adset, objective) : 0;
  const adsetKpi = adset ? getPrimaryKPI(adset, objective) : null;
  const notFound = state.status === "ok" && !adset;

  return (
    <>
      <div className="pt-5">
        <Breadcrumbs
          items={[
            { label: "All campaigns", href: appHref("/meta") },
            {
              label: campaign?.name || "Campaign",
              href: appHref(`/meta/c/${campaignId}`),
            },
            { label: adset?.name || "Loading…" },
          ]}
        />
      </div>

      {state.status === "loading" && (
        <div className="mt-10">
          <SkeletonList rows={4} />
        </div>
      )}

      {state.status === "error" && (
        <ErrorState
          title="Couldn't load this ad set"
          sub="The Meta API didn't return data. Try again or go back."
        />
      )}

      {notFound && (
        <EmptyState
          title="Ad set not found"
          sub="This ad set may have been deleted or doesn't exist in the selected date range."
        />
      )}

      {state.status === "ok" && adset && (
        <>
          <section className="mt-5 surface-lift px-6 py-5">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex items-start gap-4 min-w-0">
                <Avatar name={adset.name} node={adset} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <ObjectiveTag objective={objective} config={objConf} />
                    <StatusPill node={adset} />
                  </div>
                  <h1 className="text-[24px] font-bold tracking-tight text-ink-900 leading-tight">
                    {adset.name}
                  </h1>
                  <p className="mt-1 text-xs text-ink-500">
                    Inside{" "}
                    <a
                      href={appHref(`/meta/c/${campaignId}`)}
                      className="text-brand-600 hover:underline font-medium"
                    >
                      {campaign.name}
                    </a>{" "}
                    · {ads.length} ad{ads.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <ScoreBadge score={adsetScore} size="lg" />
                <RangeBadge
                  range={range}
                  dateStart={adsetInsight.date_start}
                  dateStop={adsetInsight.date_stop}
                />
              </div>
            </div>
          </section>

          <section className="mt-4 mb-4">
            <MetricGrid cols={5}>
              <MetricCard
                label={adsetKpi.label}
                value={adsetKpi.raw != null ? fmtMoney(adsetKpi.raw) : "—"}
                icon={Target}
                tone="brand"
              />
              <MetricCard
                label="Spend"
                value={fmtMoney(num(adsetInsight.spend))}
                icon={Wallet}
              />
              <MetricCard
                label={getResultLabel(objective)}
                value={fmtNum(getResults(adset, objective))}
                icon={TrendingUp}
                accent="bg-emerald-50 text-emerald-600"
              />
              <MetricCard
                label="CTR"
                value={fmtPct(num(adsetInsight.ctr))}
                icon={Activity}
                accent="bg-violet-50 text-violet-600"
              />
              <MetricCard
                label="Frequency"
                value={`×${num(adsetInsight.frequency).toFixed(2)}`}
                icon={Users}
                accent={
                  num(adsetInsight.frequency) > 3.5
                    ? "bg-amber-50 text-amber-600"
                    : "bg-ink-100 text-ink-500"
                }
                tone={num(adsetInsight.frequency) > 3.5 ? "warn" : "default"}
              />
            </MetricGrid>
          </section>

          <section className="mb-4">
            {callouts.length > 0 ? (
              <InsightStack callouts={callouts} />
            ) : ads.length > 0 ? (
              <div className="surface flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <TrendingUp size={14} />
                </div>
                <p className="text-sm text-ink-700">
                  Ads in this set are performing within healthy ranges.
                </p>
              </div>
            ) : null}
          </section>

          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-ink-200">
              <h2 className="text-[15px] font-bold text-ink-900 mr-1">
                Ads
                <span className="ml-2 text-xs font-semibold text-ink-500 tabular">
                  {sorted.length}
                </span>
              </h2>
              {reconciliation && (
                <ReconcileBadge
                  result={reconciliation}
                  childCount={ads.length}
                  childLabel={ads.length === 1 ? "ad" : "ads"}
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
                  placeholder="Search ads"
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
                {sorted.length} of {ads.length}
              </span>
            </div>

            {sorted.length === 0 ? (
              <EmptyState
                title={
                  ads.length === 0
                    ? "No ads in this ad set"
                    : "No ads match these filters"
                }
                sub={
                  ads.length === 0
                    ? "Creatives haven't been added to this ad set yet."
                    : "Try a different filter or clear the search."
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {sorted.map((a, idx) => (
                  <AdRow
                    key={a.id}
                    ad={a}
                    objective={objective}
                    rank={idx + 1}
                    compareActive={compare.ids.includes(a.id)}
                    compareDisabled={!compare.ids.includes(a.id) && compare.isFull}
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
            title="Compare ads"
            itemKindLabel="ads"
          />

          <DetailDrawer
            open={!!detailItem}
            onClose={() => setDetailItem(null)}
            item={detailItem}
            kind="ad"
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

function CreativeThumb({ ad }) {
  const url = ad.creative?.thumbnail_url;
  if (!url) {
    return (
      <div className="h-14 w-14 rounded-lg bg-ink-100 flex items-center justify-center text-ink-400 shrink-0 ring-2 ring-white">
        <ImageOff size={16} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-14 w-14 rounded-lg object-cover bg-ink-100 ring-2 ring-white shadow-sm shrink-0"
    />
  );
}

function AdRow({
  ad,
  objective,
  rank,
  compareActive,
  compareDisabled,
  onToggleCompare,
  onView,
}) {
  const i = ins(ad);
  const kpi = getPrimaryKPI(ad, objective);
  const results = getResults(ad, objective);
  const { fmtMoney } = useAccount();

  return (
    <li className="hover:bg-brand-50/40 transition-colors">
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="text-[10px] font-bold text-ink-300 tabular w-5 shrink-0">
          {rank.toString().padStart(2, "0")}
        </span>
        <CreativeThumb ad={ad} />
        <ScoreBadge score={ad._score} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink-900 line-clamp-2 leading-snug">
            {ad.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill node={ad} />
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
          title="View full details and previews"
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
