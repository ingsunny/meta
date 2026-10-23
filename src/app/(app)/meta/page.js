"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  Wallet,
  Eye,
  MousePointerClick,
  Zap,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangeBadge } from "@/components/layout/DateRangePicker";
import { MetricCard, MetricGrid } from "@/components/metrics/MetricCard";
import { Avatar } from "@/components/metrics/Avatar";
import {
  ScoreBadge,
  StatusPill,
  ObjectiveTag,
} from "@/components/metrics/ScoreBadge";
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
  rollup,
} from "@/lib/meta/metrics";
import { isDelivering } from "@/lib/meta/status";
import { num, int, fmtNum, fmtPct } from "@/lib/meta/format";
import { buildCallouts } from "@/lib/meta/insights";
import {
  aggregateAccountAlerts,
  buildPriorityQueue,
  topAlert as computeTopAlert,
} from "@/lib/meta/alerts";
import { AlertsBanner, AlertChip } from "@/components/alerts/AlertsBanner";
import { PriorityBell } from "@/components/alerts/PriorityBell";
import { useAccount, useAppHref } from "@/components/account/AccountContext";

export default function CampaignsListPage() {
  const params = useSearchParams();
  const range = params.get("range") || "maximum";
  const since = params.get("since");
  const until = params.get("until");
  const { accountId, currency, fmtMoney } = useAccount();

  const [data, setData] = useState({
    status: "loading",
    campaigns: [],
    dateStart: null,
    dateStop: null,
  });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("score");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const compare = useCompareSelection({ max: 3 });

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setData((d) => ({ ...d, status: "loading" }));
    const qs = new URLSearchParams({ account: accountId, range });
    if (range === "custom" && since && until) {
      qs.set("since", since);
      qs.set("until", until);
    }
    fetch(`/api/meta/campaigns?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => {
        if (!alive) return;
        if (!j.success) throw new Error("unsuccessful");
        const sample = j.campaigns.map((c) => ins(c)).find((i) => i.date_start);
        setData({
          status: "ok",
          campaigns: j.campaigns,
          dateStart: sample?.date_start || null,
          dateStop: sample?.date_stop || null,
        });
      })
      .catch(() => alive && setData({ status: "error", campaigns: [] }));
    return () => {
      alive = false;
    };
  }, [range, since, until, accountId]);

  const { campaigns } = data;

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter === "ACTIVE" && !isDelivering(c)) return false;
      if (statusFilter === "PAUSED" && isDelivering(c)) return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [campaigns, statusFilter, query]);

  const sorted = useMemo(() => {
    const scored = filtered.map((c) => ({ ...c, _score: getScore(c) }));
    return scored.sort((a, b) => {
      if (sortBy === "score") return b._score - a._score;
      if (sortBy === "spend") return num(ins(b).spend) - num(ins(a).spend);
      if (sortBy === "results") return getResults(b) - getResults(a);
      if (sortBy === "ctr") return num(ins(b).ctr) - num(ins(a).ctr);
      return 0;
    });
  }, [filtered, sortBy]);

  const totals = useMemo(() => rollup(campaigns), [campaigns]);
  const callouts = useMemo(() => buildCallouts(campaigns), [campaigns]);
  const accountAlerts = useMemo(
    () => aggregateAccountAlerts(campaigns),
    [campaigns],
  );
  const priorities = useMemo(() => buildPriorityQueue(campaigns), [campaigns]);

  const openCampaignDetail = (campaign) => {
    if (!campaign) return;
    setDetailItem(campaign);
    setDrawerOpen(true);
  };

  const activeCount = campaigns.filter(isDelivering).length;
  const compareItems = campaigns.filter((c) => compare.ids.includes(c.id));

  return (
    <>
      <PageHeader
        eyebrow={
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
            Account overview
          </p>
        }
        title="All campaigns"
        sub={
          campaigns.length > 0
            ? `${campaigns.length} campaigns · ${activeCount} active · ${fmtMoney(totals.spend)} ${currency} spend`
            : "Performance across every campaign in this ad account."
        }
        right={
          <div className="flex items-center gap-3">
            <PriorityBell
              priorities={priorities}
              onSelect={(p) =>
                openCampaignDetail(campaigns.find((c) => c.id === p.id))
              }
            />
            <RangeBadge
              range={range}
              // dateStart={data.dateStart}
              // dateStop={data.dateStop}
            />
          </div>
        }
      />

      <section className="mb-6">
        <MetricGrid cols={4}>
          <MetricCard
            label={`Total spend · ${currency}`}
            value={fmtMoney(totals.spend)}
            icon={Wallet}
          />
          <MetricCard
            label="Impressions"
            value={fmtNum(totals.impressions)}
            icon={Eye}
            accent="bg-violet-50 text-violet-600"
          />
          <MetricCard
            label="Clicks"
            value={fmtNum(totals.clicks)}
            icon={MousePointerClick}
            accent="bg-emerald-50 text-emerald-600"
            sub={
              totals.impressions > 0
                ? `${fmtPct((totals.clicks / totals.impressions) * 100)} CTR`
                : null
            }
          />
          <MetricCard
            label="Active"
            value={`${activeCount}`}
            sub={`of ${campaigns.length} campaigns`}
            icon={Zap}
            accent={
              activeCount > 0
                ? "bg-amber-50 text-amber-600"
                : "bg-ink-100 text-ink-400"
            }
            tone={activeCount > 0 ? "default" : "muted"}
          />
        </MetricGrid>
      </section>

      {/* {accountAlerts.length > 0 && (
        <section className="mb-4">
          <AlertsBanner alerts={accountAlerts} />
        </section>
      )} */}

      <section className="mb-6">
        {callouts.length > 0 ? (
          <InsightStack callouts={callouts} />
        ) : campaigns.length > 0 ? (
          <div className="surface flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <TrendingUp size={14} />
            </div>
            <p className="text-sm text-ink-700">
              No flagged issues. All campaigns are within healthy ranges for
              this period.
            </p>
          </div>
        ) : null}
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-ink-200">
          <h2 className="text-[15px] font-bold text-ink-900 mr-2">
            Campaigns
            <span className="ml-2 text-xs font-semibold text-ink-500 tabular">
              {sorted.length}
            </span>
          </h2>
          <div className="relative ml-auto flex-1 min-w-50 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-ink-50 text-sm rounded-full pl-9 pr-3 py-1.5 ring-1 ring-ink-200 focus:ring-brand-500 focus:bg-white outline-none transition-all text-ink-800 placeholder:text-ink-400"
            />
          </div>
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
        </div>

        {data.status === "loading" && (
          <div className="p-5">
            <SkeletonList rows={4} />
          </div>
        )}

        {data.status === "error" && (
          <ErrorState
            title="Couldn't load campaigns"
            sub="There was a problem reaching the Meta API. Check your token and try again."
            onRetry={() => {
              setData({ status: "loading", campaigns: [] });
              const retryQs = new URLSearchParams({
                account: accountId || "",
                range,
              });
              if (range === "custom" && since && until) {
                retryQs.set("since", since);
                retryQs.set("until", until);
              }
              fetch(`/api/meta/campaigns?${retryQs}`)
                .then((r) => r.json())
                .then((j) =>
                  setData({ status: "ok", campaigns: j.campaigns || [] }),
                )
                .catch(() => setData({ status: "error", campaigns: [] }));
            }}
          />
        )}

        {data.status === "ok" && sorted.length === 0 && (
          <EmptyState
            title="No campaigns match these filters"
            sub="Try clearing the search or selecting All status."
          />
        )}

        {data.status === "ok" && sorted.length > 0 && (
          <ul className="divide-y divide-ink-100">
            {sorted.map((c, idx) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                peers={campaigns}
                rank={idx + 1}
                range={range}
                compareActive={compare.ids.includes(c.id)}
                compareDisabled={!compare.ids.includes(c.id) && compare.isFull}
                onToggleCompare={() => compare.toggle(c.id)}
                onView={() => setDetailItem(c)}
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
        onRemove={compare.remove}
        title="Compare campaigns"
        itemKindLabel="campaigns"
      />

      <DetailDrawer
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        kind="campaign"
      />
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

function CampaignRow({
  campaign,
  peers,
  rank,
  range,
  compareActive,
  compareDisabled,
  onToggleCompare,
  onView,
}) {
  const i = ins(campaign);
  const objConf = getObjConfig(campaign.objective);
  const kpi = getPrimaryKPI(campaign);
  const results = getResults(campaign);
  const { fmtMoney } = useAccount();
  const appHref = useAppHref();
  const alert = computeTopAlert(campaign, { peers });

  return (
    <li className="group hover:bg-brand-50/40 transition-colors">
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="text-[10px] font-bold text-ink-300 tabular w-5 shrink-0">
          {rank.toString().padStart(2, "0")}
        </span>

        {/* <Avatar name={campaign.name} node={campaign} size="md" /> */}

        <ScoreBadge score={campaign._score} size="sm" />

        <div className="min-w-0 flex-1">
          <Link
            href={appHref(`/meta/c/${campaign.id}`)}
            className="inline-flex items-center gap-1 text-[15px] font-bold text-ink-900 hover:text-brand-600 transition-colors leading-tight"
          >
            <span className="line-clamp-1">{campaign.name}</span>
            <ChevronRight
              size={14}
              className="text-ink-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0"
            />
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ObjectiveTag objective={campaign.objective} config={objConf} />
            <StatusPill node={campaign} />
            <AlertChip alert={alert} />
          </div>
        </div>

        <div className="hidden lg:grid grid-cols-5 gap-5 items-center">
          <Metric
            label={kpi.label}
            value={kpi.raw != null ? fmtMoney(kpi.raw) : "—"}
            highlight
          />
          <Metric
            label={getResultLabel(campaign.objective)}
            value={fmtNum(results)}
          />
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
        <DownloadReportButton campaignId={campaign.id} range={range} />
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
