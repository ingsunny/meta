"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Sparkles,
  Compass,
  TrendingDown,
  TrendingUp,
  Users,
  Layers,
  Smartphone,
  Palette,
  Film,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { useAccount } from "@/components/account/AccountContext";
import {
  overallVerdict,
  gradeMetrics,
  gradeCreative,
  topAds,
  topRowsByVolume,
  findDrains,
  buildPlaybook,
  adDirection,
  audienceDirection,
  platformDirection,
  placementDirection,
} from "@/lib/meta/scale";
import { getObjKey } from "@/lib/meta/metrics";
import { volumeNoun } from "@/lib/meta/audience-insights";

const DIMENSIONS_TO_FETCH = ["age_gender", "platform", "placement"];

// "Where to scale" tab. Walks every parameter of the item, then breaks down
// performance by topic (creative · audience · platform · placement). Each
// topic card carries a Direction line telling the user what to push and what
// to leave/cut. Ends with a synthesized blueprint and any money-drain flags.
export function ScalePanel({ item, objective, kind = "campaign" }) {
  const searchParams = useSearchParams();
  const { accountId, fmtMoney } = useAccount();
  const [breakdowns, setBreakdowns] = useState(null);
  const [bdLoading, setBdLoading] = useState(true);
  const [bdError, setBdError] = useState(null);
  const [childAds, setChildAds] = useState(null);
  const [adsLoading, setAdsLoading] = useState(true);
  const [adsError, setAdsError] = useState(null);

  // Build the param tail (account/range/since/until) once and reuse.
  const buildQs = (extra) => {
    const qs = new URLSearchParams(extra);
    if (accountId) qs.set("account", accountId);
    const range = searchParams.get("range");
    const since = searchParams.get("since");
    const until = searchParams.get("until");
    if (range) qs.set("range", range);
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    return qs;
  };

  // Fetch breakdowns (age_gender, platform, placement) in one round-trip.
  useEffect(() => {
    if (!item?.id) return;
    let alive = true;
    setBdLoading(true);
    setBdError(null);
    setBreakdowns(null);

    const qs = buildQs({
      id: item.id,
      dimensions: DIMENSIONS_TO_FETCH.join(","),
    });

    fetch(`/api/meta/breakdown?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success && j.breakdowns) setBreakdowns(j.breakdowns);
        else setBdError(j.detail || j.error || "Couldn't load audience data");
      })
      .catch((e) => alive && setBdError(e.message))
      .finally(() => alive && setBdLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, accountId, searchParams]);

  // Fetch child ads for the creative topic — only when viewing a campaign or
  // ad set (an individual ad has no children).
  useEffect(() => {
    if (!item?.id || kind === "ad") {
      setChildAds([]);
      setAdsLoading(false);
      return;
    }
    let alive = true;
    setAdsLoading(true);
    setAdsError(null);
    setChildAds(null);

    const qs = buildQs({ id: item.id });

    fetch(`/api/meta/children?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success) setChildAds(j.ads || []);
        else setAdsError(j.detail || j.error || "Couldn't load ads");
      })
      .catch((e) => alive && setAdsError(e.message))
      .finally(() => alive && setAdsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, kind, accountId, searchParams]);

  const verdict = overallVerdict(item, objective);
  const metrics = gradeMetrics(item, objective, fmtMoney);
  const creative = gradeCreative(item, objective);

  const topAdsList = childAds ? topAds(childAds, objective, 5) : [];
  const topAudienceList = breakdowns
    ? topRowsByVolume(breakdowns.age_gender, "age_gender", objective, 6)
    : [];
  const topPlatformsList = breakdowns
    ? topRowsByVolume(breakdowns.platform, "platform", objective, 4)
    : [];
  const topPlacementsList = breakdowns
    ? topRowsByVolume(breakdowns.placement, "placement", objective, 5)
    : [];

  const noun = volumeNoun(objective);
  const adsDir = adDirection(topAdsList, noun);
  const audienceDir = audienceDirection(topAudienceList, noun);
  const platformDir = platformDirection(topPlatformsList, noun);
  const placementDir = placementDirection(topPlacementsList, noun);

  const drains = breakdowns ? findDrains(breakdowns, objective) : [];

  const playbook = buildPlaybook({
    item,
    objective,
    topAdsList,
    topAudienceList,
    topPlatformsList,
    topPlacementsList,
  });

  const objKey = getObjKey(objective);
  const showAdsCard = kind !== "ad";
  const volumeLabel =
    objKey === "AWARENESS"
      ? "reach"
      : objKey === "TRAFFIC"
        ? "clicks"
        : noun;

  return (
    <div className="space-y-7">
      <VerdictHeader verdict={verdict} />

      <Section
        icon={CheckCircle2}
        iconBg="bg-brand-100 text-brand-700"
        title="The numbers — parameter by parameter"
        sub="Each metric graded as Healthy, Watch, or Needs fix. Plain-English reason + what to do, no jargon."
      >
        <div className="grid gap-2.5 md:grid-cols-2">
          {metrics.map((m) => (
            <MetricCard key={m.key} metric={m} />
          ))}
        </div>
      </Section>

      {creative && (
        <Section
          icon={Palette}
          iconBg="bg-violet-100 text-violet-700"
          title="Creative health"
          sub="Combined verdict on click rate and frequency — is the ad still landing, or is it wearing out?"
        >
          <CreativeCard creative={creative} />
        </Section>
      )}

      <Section
        icon={Compass}
        iconBg="bg-emerald-100 text-emerald-700"
        title="Where to scale — push or leave?"
        sub={`For each topic: ranked winners by ${volumeLabel}, then a clear direction on what to push more budget into and what to cut.`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {showAdsCard && (
            <TopicCard
              icon={Film}
              iconClass="bg-brand-100 text-brand-700"
              title="Top creatives"
              sub={`Which ads are pulling the most ${noun}`}
              loading={adsLoading}
              error={adsError}
              emptyText={`No ad has produced ${noun} yet in this period.`}
              items={topAdsList}
              direction={adsDir}
              renderItem={(ad, idx) => (
                <AdRow ad={ad} rank={idx + 1} noun={noun} key={ad.id} />
              )}
            />
          )}

          <TopicCard
            icon={Users}
            iconClass="bg-emerald-100 text-emerald-700"
            title="Top audience segments"
            sub="Age × gender — where conversions are concentrated"
            loading={bdLoading}
            error={bdError}
            emptyText={`No segment has produced ${noun} yet.`}
            items={topAudienceList}
            direction={audienceDir}
            renderItem={(row, idx) => (
              <SliceRow
                row={row}
                rank={idx + 1}
                noun={noun}
                key={`${row.label}-${idx}`}
              />
            )}
          />

          <TopicCard
            icon={Layers}
            iconClass="bg-violet-100 text-violet-700"
            title="Top platforms"
            sub="Facebook · Instagram · Audience Network · Messenger"
            loading={bdLoading}
            error={bdError}
            emptyText={`No platform has produced ${noun} yet.`}
            items={topPlatformsList}
            direction={platformDir}
            renderItem={(row, idx) => (
              <SliceRow
                row={row}
                rank={idx + 1}
                noun={noun}
                key={`${row.label}-${idx}`}
              />
            )}
          />

          <TopicCard
            icon={Smartphone}
            iconClass="bg-amber-100 text-amber-700"
            title="Top placements"
            sub="Feed · Reels · Stories · Marketplace etc."
            loading={bdLoading}
            error={bdError}
            emptyText={`No placement has produced ${noun} yet.`}
            items={topPlacementsList}
            direction={placementDir}
            renderItem={(row, idx) => (
              <SliceRow
                row={row}
                rank={idx + 1}
                noun={noun}
                key={`${row.label}-${idx}`}
              />
            )}
          />
        </div>
      </Section>

      {playbook && playbook.lines.length > 0 && (
        <Section
          icon={Rocket}
          iconBg="bg-brand-100 text-brand-700"
          title="The scale blueprint"
          sub="Synthesized from the winners above. Build a focused ad set with these knobs and put your next budget increase there."
        >
          <PlaybookCard playbook={playbook} kind={kind} />
        </Section>
      )}

      {drains.length > 0 && (
        <Section
          icon={TrendingDown}
          iconBg="bg-rose-100 text-rose-700"
          title="Things to watch — slices draining your budget"
          sub="Only shown when a slice's cost is ≥1.7× the cheapest alternative AND eats more than 5% of the budget."
        >
          <div className="grid gap-2.5 md:grid-cols-2">
            {drains.map((d) => (
              <DrainCard key={d.dimension} drain={d} />
            ))}
          </div>
        </Section>
      )}

      {bdError && !bdLoading && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
          <p className="text-[12px] text-amber-900 leading-relaxed">
            <span className="font-semibold">Heads up:</span> couldn't load all
            audience breakdowns, so the answers above may be incomplete.{" "}
            <span className="text-amber-700">({bdError})</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ icon: Icon, iconBg, title, sub, children }) {
  return (
    <section>
      <div className="flex items-start gap-2.5 mb-3">
        <span
          className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full ${iconBg}`}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            {title}
          </h3>
          {sub && (
            <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
              {sub}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

// ── Topic card (ranked list + push/leave direction footer) ─────────────────

function TopicCard({
  icon: Icon,
  iconClass,
  title,
  sub,
  loading,
  error,
  emptyText,
  items,
  renderItem,
  direction,
}) {
  return (
    <div className="rounded-xl ring-1 ring-ink-200/70 bg-white px-4 py-3.5">
      <div className="flex items-start gap-2.5 mb-3">
        <span
          className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={13} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
            Topic
          </p>
          <p className="text-sm font-bold text-ink-900 leading-tight">
            {title}
          </p>
          {sub && (
            <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
              {sub}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center text-[12px] text-ink-400 py-4">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-ink-200 border-t-brand-500 animate-spin mr-2" />
          Loading…
        </div>
      ) : error ? (
        <p className="text-[12px] text-amber-800 py-3">
          Couldn't load this data. {error}
        </p>
      ) : !items || items.length === 0 ? (
        <p className="text-[12px] text-ink-500 italic py-3">{emptyText}</p>
      ) : (
        <>
          <ol className="divide-y divide-ink-100">{items.map(renderItem)}</ol>
          {direction && <DirectionFooter direction={direction} />}
        </>
      )}
    </div>
  );
}

function DirectionFooter({ direction }) {
  return (
    <div className="mt-3 pt-3 border-t border-ink-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">
        Direction
      </p>
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mt-px">
            <ArrowUpRight size={11} />
          </span>
          <p className="text-[12px] text-ink-700 leading-relaxed">
            <span className="font-bold text-emerald-700">Push: </span>
            {direction.push}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 mt-px">
            <ArrowDownLeft size={11} />
          </span>
          <p className="text-[12px] text-ink-700 leading-relaxed">
            <span className="font-bold text-rose-700">Leave/Cut: </span>
            {direction.leave}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Row renderers ──────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  const isWinner = rank === 1;
  return (
    <span
      className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
        isWinner ? "bg-emerald-600 text-white" : "bg-ink-100 text-ink-700"
      }`}
    >
      {rank}
    </span>
  );
}

function AdRow({ ad, rank, noun }) {
  const { fmtMoney } = useAccount();
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <RankBadge rank={rank} />
      {ad.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.thumbnail}
          alt=""
          className="h-10 w-10 rounded object-cover ring-1 ring-ink-200 shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-ink-100 ring-1 ring-ink-200 shrink-0 inline-flex items-center justify-center">
          <Film size={12} className="text-ink-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold text-ink-900 leading-tight truncate"
          title={ad.name}
        >
          {ad.name}
        </p>
        <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
          <span className="font-bold text-ink-900 tabular">
            {(ad.volume || 0).toLocaleString("en-IN")}
          </span>{" "}
          {noun}
          {ad.cost != null && (
            <>
              {" "}
              ·{" "}
              <span className="font-bold tabular">{fmtMoney(ad.cost)}</span>{" "}
              each
            </>
          )}{" "}
          · <span className="tabular">{fmtMoney(ad.spend)}</span> spent
        </p>
      </div>
    </li>
  );
}

function SliceRow({ row, rank, noun }) {
  const { fmtMoney } = useAccount();
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold text-ink-900 leading-tight truncate"
          title={row.label}
        >
          {row.label}
        </p>
        <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
          <span className="font-bold text-ink-900 tabular">
            {(row.volume || 0).toLocaleString("en-IN")}
          </span>{" "}
          {noun}
          {row.cost != null && (
            <>
              {" "}
              ·{" "}
              <span className="font-bold tabular">{fmtMoney(row.cost)}</span>{" "}
              each
            </>
          )}{" "}
          · <span className="tabular">{fmtMoney(row.spend)}</span> spent
        </p>
      </div>
    </li>
  );
}

// ── Verdict header ─────────────────────────────────────────────────────────

const TONE_STYLE = {
  scale: {
    border: "ring-emerald-200",
    bg: "bg-emerald-50/40",
    chip: "bg-emerald-600",
    icon: Rocket,
    text: "text-emerald-700",
  },
  healthy: {
    border: "ring-emerald-200",
    bg: "bg-emerald-50/30",
    chip: "bg-emerald-600",
    icon: CheckCircle2,
    text: "text-emerald-700",
  },
  watch: {
    border: "ring-amber-200",
    bg: "bg-amber-50/40",
    chip: "bg-amber-600",
    icon: AlertTriangle,
    text: "text-amber-700",
  },
  fix: {
    border: "ring-rose-200",
    bg: "bg-rose-50/40",
    chip: "bg-rose-600",
    icon: AlertCircle,
    text: "text-rose-700",
  },
  pending: {
    border: "ring-ink-200",
    bg: "bg-ink-50/60",
    chip: "bg-ink-500",
    icon: Clock,
    text: "text-ink-700",
  },
};

function VerdictHeader({ verdict }) {
  const s = TONE_STYLE[verdict.tone] || TONE_STYLE.healthy;
  const Icon = s.icon;
  return (
    <div className={`rounded-2xl ring-1 ${s.border} ${s.bg} px-5 py-5`}>
      <div className="flex items-start gap-4">
        <span
          className={`shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-full ${s.chip} text-white`}
        >
          <Icon size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p
              className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}
            >
              Verdict
            </p>
            <span className="text-[10px] font-bold text-ink-500 tabular">
              Health score {verdict.score}/100 ·{" "}
              {verdict.tier.label.toLowerCase()}
            </span>
          </div>
          <h2 className="text-lg font-bold text-ink-900 leading-tight mt-1">
            {verdict.headline}
          </h2>
          <p className="text-[13px] text-ink-700 mt-2 leading-relaxed">
            {verdict.sub}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Metric + creative cards (verdict dot reuse) ────────────────────────────

const VERDICT_DOT = {
  scale: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Scale" },
  healthy: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    label: "Healthy",
  },
  watch: { dot: "bg-amber-500", text: "text-amber-700", label: "Watch" },
  fix: { dot: "bg-rose-500", text: "text-rose-700", label: "Needs fix" },
  pending: { dot: "bg-ink-300", text: "text-ink-500", label: "Wait" },
};

function VerdictTag({ verdict }) {
  const s = VERDICT_DOT[verdict] || VERDICT_DOT.healthy;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}
      >
        {s.label}
      </span>
    </span>
  );
}

function MetricCard({ metric }) {
  return (
    <div className="rounded-xl ring-1 ring-ink-200/70 bg-white px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {metric.label}
        </p>
        <VerdictTag verdict={metric.verdict} />
      </div>
      <p className="text-2xl font-bold tabular text-ink-900 leading-tight">
        {metric.value}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-ink-800 leading-tight">
        {metric.headline}
      </p>
      <p className="mt-1.5 text-[12px] text-ink-600 leading-relaxed">
        {metric.reason}
      </p>
      {metric.action && (
        <p className="mt-1.5 text-[12px] text-ink-800 leading-relaxed">
          <span className="font-semibold">Do:</span> {metric.action}
        </p>
      )}
    </div>
  );
}

function CreativeCard({ creative }) {
  return (
    <div className="rounded-xl ring-1 ring-ink-200/70 bg-white px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Creative
        </p>
        <VerdictTag verdict={creative.verdict} />
      </div>
      <p className="text-base font-bold text-ink-900 leading-tight">
        {creative.headline}
      </p>
      <p className="mt-1.5 text-[13px] text-ink-700 leading-relaxed">
        {creative.reason}
      </p>
      <p className="mt-1.5 text-[13px] text-ink-900 leading-relaxed">
        <span className="font-semibold">What to do:</span> {creative.action}
      </p>
    </div>
  );
}

// ── Playbook card ──────────────────────────────────────────────────────────
// Rich, ready-to-execute blueprint: recipe (each line + share/cost chips),
// confidence pill, expected outcome (cost + projected volume range),
// suggested budget, step-by-step launch checklist, and risk warnings.

const PLAYBOOK_ICON = {
  audience: Users,
  platform: Layers,
  placement: Smartphone,
  ad: Film,
};

const CONFIDENCE_STYLE = {
  strong: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    ring: "ring-emerald-300",
    dot: "bg-emerald-500",
    label: "Strong signal",
  },
  early: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    ring: "ring-amber-300",
    dot: "bg-amber-500",
    label: "Early signal",
  },
  thin: {
    bg: "bg-rose-100",
    text: "text-rose-700",
    ring: "ring-rose-300",
    dot: "bg-rose-500",
    label: "Thin signal",
  },
};

const CONTEXT_CHIP_STYLE = {
  share: "bg-brand-50 text-brand-700 ring-brand-200",
  better: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  worse: "bg-rose-50 text-rose-700 ring-rose-200",
  neutral: "bg-ink-50 text-ink-600 ring-ink-200",
};

function PlaybookCard({ playbook, kind }) {
  const { fmtMoney } = useAccount();
  return (
    <div className="rounded-2xl ring-2 ring-brand-300 bg-linear-to-br from-brand-50/80 to-white px-5 py-5 space-y-4">
      <PlaybookHeader playbook={playbook} />
      <PlaybookRecipe playbook={playbook} fmtMoney={fmtMoney} />
      <div className="grid gap-3 md:grid-cols-2">
        <ExpectedOutcomeCard playbook={playbook} fmtMoney={fmtMoney} />
        <SuggestedBudgetCard playbook={playbook} fmtMoney={fmtMoney} />
      </div>
      <LaunchChecklistCard
        playbook={playbook}
        fmtMoney={fmtMoney}
        kind={kind}
      />
      {playbook.warnings && playbook.warnings.length > 0 && (
        <PlaybookWarnings warnings={playbook.warnings} />
      )}
    </div>
  );
}

function PlaybookHeader({ playbook }) {
  const c = CONFIDENCE_STYLE[playbook.confidence] || CONFIDENCE_STYLE.early;
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
        <Sparkles size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
          Build this ad set
        </p>
        <p className="text-sm font-bold text-ink-900 leading-tight mt-0.5">
          A focused setup combining the winners above — your highest-odds bet.
        </p>
        {playbook.confidenceReason && (
          <p className="text-[12px] text-ink-600 mt-1 leading-relaxed">
            {playbook.confidenceReason}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${c.bg} ring-1 ${c.ring}`}
      >
        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${c.text} whitespace-nowrap`}
        >
          {c.label}
        </span>
      </span>
    </div>
  );
}

function PlaybookRecipe({ playbook, fmtMoney }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-brand-200/60 px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-3">
        The recipe — copy these into Ads Manager
      </p>
      <div className="divide-y divide-ink-100">
        {playbook.lines.map((line) => (
          <RecipeLine key={line.key} line={line} fmtMoney={fmtMoney} />
        ))}
      </div>
    </div>
  );
}

function RecipeLine({ line, fmtMoney }) {
  const Icon = PLAYBOOK_ICON[line.key] || Users;
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          {line.label}
        </p>
        <p
          className="text-[14px] font-bold text-ink-900 leading-tight truncate"
          title={line.value}
        >
          {line.value}
        </p>
        {line.context && line.context.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {line.context.map((chip, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ring-1 ${
                  CONTEXT_CHIP_STYLE[chip.kind] || CONTEXT_CHIP_STYLE.neutral
                }`}
              >
                {chip.text}
              </span>
            ))}
          </div>
        )}
      </div>
      {line.sliceCost != null && (
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            cost
          </p>
          <p className="text-[12px] font-bold text-ink-900 tabular">
            {fmtMoney(line.sliceCost)}
          </p>
        </div>
      )}
    </div>
  );
}

function ExpectedOutcomeCard({ playbook, fmtMoney }) {
  const hasCost = playbook.avgWinnerCost != null;
  return (
    <div className="rounded-xl bg-white ring-1 ring-brand-200/60 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <TrendingUp size={13} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Expected outcome
        </p>
      </div>

      {hasCost ? (
        <>
          <p className="text-[11px] text-ink-500 leading-tight">
            {playbook.costName}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="text-2xl font-bold tabular text-brand-700 leading-tight">
              {fmtMoney(playbook.avgWinnerCost)}
            </p>
            {playbook.currentCost != null &&
              playbook.currentCost !== playbook.avgWinnerCost && (
                <p className="text-[11px] text-ink-500 line-through tabular">
                  {fmtMoney(playbook.currentCost)}
                </p>
              )}
          </div>
          {playbook.improvementPct != null ? (
            <p className="text-[12px] text-emerald-700 font-semibold mt-1">
              ≈ {Math.round(playbook.improvementPct)}% better than current avg
            </p>
          ) : (
            <p className="text-[12px] text-ink-500 mt-1">
              Near current avg — small lift expected from this knob set.
            </p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-ink-500">
          Not enough volume to forecast {playbook.costName} confidently.
        </p>
      )}

      {playbook.projected && (
        <div className="mt-3 pt-3 border-t border-ink-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1">
            At suggested budget
          </p>
          <p className="text-[15px] font-bold text-ink-900 leading-tight tabular">
            ≈ {Math.round(playbook.projected.low).toLocaleString("en-IN")}–
            {Math.round(playbook.projected.high).toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] text-ink-500 leading-tight mt-0.5">
            {playbook.volumeNoun} over the same period
          </p>
        </div>
      )}
    </div>
  );
}

function SuggestedBudgetCard({ playbook, fmtMoney }) {
  if (playbook.newSpend == null || playbook.totalSpend <= 0) return null;
  const change = Math.round((playbook.budgetMultiplier - 1) * 100);
  const tone =
    change > 0
      ? "text-emerald-700"
      : change < 0
        ? "text-rose-700"
        : "text-ink-600";
  const sign = change > 0 ? "+" : "";
  return (
    <div className="rounded-xl bg-white ring-1 ring-brand-200/60 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Wallet size={13} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Suggested budget
        </p>
      </div>

      <p className="text-[11px] text-ink-500 leading-tight">
        For the focused ad set, over the same period
      </p>
      <div className="flex items-baseline gap-2 mt-0.5">
        <p className="text-2xl font-bold tabular text-brand-700 leading-tight">
          {fmtMoney(playbook.newSpend)}
        </p>
        {change !== 0 && (
          <p className={`text-[11px] font-bold tabular ${tone}`}>
            {sign}
            {change}%
          </p>
        )}
      </div>
      <p className="text-[11px] text-ink-500 mt-0.5 tabular">
        from {fmtMoney(playbook.totalSpend)} now
      </p>
      <p className="text-[12px] text-ink-700 mt-2.5 leading-relaxed">
        {playbook.budgetRationale}
      </p>
    </div>
  );
}

function LaunchChecklistCard({ playbook, fmtMoney, kind }) {
  const steps = buildLaunchSteps(playbook, fmtMoney, kind);
  return (
    <div className="rounded-xl bg-white ring-1 ring-brand-200/60 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <ListChecks size={13} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Launch checklist — step by step
        </p>
      </div>
      <ol className="space-y-2.5">
        {steps.map((step, idx) => (
          <li key={idx} className="flex items-start gap-2.5">
            <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white text-[10px] font-bold tabular">
              {idx + 1}
            </span>
            <p className="text-[12.5px] text-ink-800 leading-relaxed">
              {step}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildLaunchSteps(playbook, fmtMoney, kind) {
  const parent =
    kind === "ad" ? "ad" : kind === "adset" ? "ad set" : "campaign";
  const steps = [
    `In Ads Manager, duplicate this ${parent} (or create a new ad set) and name it something like "Scale — focused recipe".`,
  ];

  for (const line of playbook.lines) {
    if (line.key === "audience") {
      steps.push(
        `Set audience targeting to "${line.value}". Drop every other segment — that's the whole point of focusing.`,
      );
    } else if (line.key === "platform") {
      steps.push(
        `Under Placements → Manual, restrict platforms to ${line.value} only.`,
      );
    } else if (line.key === "placement") {
      steps.push(
        `Uncheck every placement except "${line.value}" so delivery doesn't leak to weaker surfaces.`,
      );
    } else if (line.key === "ad") {
      steps.push(
        `Use "${line.value}" as the primary creative — it's the proven winner.`,
      );
    }
  }

  if (playbook.newSpend != null && playbook.totalSpend > 0) {
    const mult = playbook.budgetMultiplier;
    const multLabel =
      mult === 1
        ? "matching current spend"
        : mult > 1
          ? `${mult}× current spend`
          : `${Math.round(mult * 100)}% of current spend`;
    steps.push(
      `Set the period budget to ${fmtMoney(playbook.newSpend)} — that's ${multLabel}. ${playbook.budgetRationale}`,
    );
  }

  const watchCost = playbook.avgWinnerCost || playbook.currentCost;
  if (watchCost != null) {
    steps.push(
      `Let it run 5–7 days before optimizing. Check ${playbook.costName.toLowerCase()} daily — pause if it drifts more than ~25% above ${fmtMoney(watchCost)}.`,
    );
  } else {
    steps.push(
      `Let it run 5–7 days before optimizing. Watch ${playbook.costName.toLowerCase()} against your internal target.`,
    );
  }

  return steps;
}

function PlaybookWarnings({ warnings }) {
  return (
    <div className="rounded-xl bg-amber-50/60 ring-1 ring-amber-200 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <ShieldAlert size={13} />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Watch for — {warnings.length} thing{warnings.length === 1 ? "" : "s"}{" "}
          that could break this scale
        </p>
      </div>
      <ul className="space-y-2.5">
        {warnings.map((w) => (
          <li key={w.key} className="flex items-start gap-2.5">
            <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-amber-800 mt-0.5">
              <AlertTriangle size={9} />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-ink-900 leading-tight">
                {w.headline}
              </p>
              <p className="text-[12px] text-ink-700 leading-relaxed mt-0.5">
                {w.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Drain card ─────────────────────────────────────────────────────────────

function DrainCard({ drain }) {
  const { fmtMoney } = useAccount();
  const spendPct = Math.round(drain.spendShare * 100);
  const resultPct = Math.round(drain.resultShare * 100);
  return (
    <div className="rounded-xl ring-1 ring-rose-200 bg-rose-50/40 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
          Worst {drain.dimensionLabel}
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
          <TrendingDown size={10} />
          Money drain
        </span>
      </div>
      <p
        className="text-lg font-bold text-ink-900 leading-tight truncate"
        title={drain.sliceLabel}
      >
        {drain.sliceLabel}
      </p>
      <p className="mt-1.5 text-[13px] text-ink-700 leading-relaxed">
        Eats <span className="font-bold text-ink-900">{spendPct}%</span> of
        budget for only{" "}
        <span className="font-bold text-ink-900">{resultPct}%</span> of
        results.
      </p>
      <p className="text-[13px] text-ink-700 leading-relaxed">
        <span className="font-bold tabular text-rose-700">
          {fmtMoney(drain.cost)}
        </span>{" "}
        vs{" "}
        <span className="font-bold tabular text-emerald-700">
          {fmtMoney(drain.bestSliceCost)}
        </span>{" "}
        for <span className="font-semibold">{drain.bestSliceLabel}</span> —{" "}
        <span className="font-bold text-rose-700">
          {drain.ratioVsBest.toFixed(1)}× more expensive
        </span>
        .
      </p>
      <p className="mt-1.5 text-[12px] text-ink-800 leading-relaxed">
        <span className="font-semibold">Do:</span>{" "}
        {drainAction(drain.dimension, drain.sliceLabel)}
      </p>
    </div>
  );
}

function drainAction(dim, slice) {
  if (dim === "placement")
    return `Open the ad set and remove "${slice}" from Placements.`;
  if (dim === "platform")
    return `Open the ad set and exclude "${slice}" from your platform list.`;
  if (dim === "country" || dim === "region")
    return `Remove "${slice}" from your location targeting.`;
  if (dim === "hour") return `Set a custom ad schedule to skip ${slice}.`;
  if (dim === "age" || dim === "gender" || dim === "age_gender")
    return `Narrow age/gender to exclude "${slice}".`;
  if (dim === "device")
    return `Add a device exclusion for "${slice}" under Ad Set → Advanced.`;
  return `Reduce or exclude "${slice}" from this ad set's targeting.`;
}
