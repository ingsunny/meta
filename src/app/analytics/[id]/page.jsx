"use client";

// /analytics/[id] — insights dashboard for one campaign.
// Shows KPIs, funnel rates, daily trend, geo/device/hour breakdowns, plus
// rich user-quality analysis. Hosts the CSV upload entrypoint and an
// inline uploads manager so any single CSV can be revoked.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Upload,
  Loader2,
  FileText,
  DollarSign,
  Target,
  TrendingUp,
  Activity,
  CheckCircle2,
  ArrowLeft,
  Smartphone,
  MapPin,
  Clock,
  Globe2,
  Trash2,
  Users,
  Repeat,
  Signal,
  Network,
  Layers,
  AlertTriangle,
  Award,
  Calendar,
  Building2,
  Lightbulb,
  Rocket,
  ShieldAlert,
  Info,
  Link2,
  Unlink,
  RefreshCw,
  Sigma,
  Flag,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Search,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  X,
  Crosshair,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Cell,
  Area,
  AreaChart,
  ReferenceLine,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { MinimalTooltip } from "@/components/charts/ChartTooltip";
import { computeForecast } from "@/lib/analytics/forecast";

const fmtMoney = (n) =>
  n == null
    ? "$0.00"
    : `$${Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
const fmtInt = (n) => (n || 0).toLocaleString("en-US");
const fmtPct = (n, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const fmtHrs = (n) => {
  if (n == null) return "—";
  if (n < 1 / 60) return `${(n * 3600).toFixed(0)}s`;
  if (n < 1) return `${(n * 60).toFixed(1)} min`;
  if (n < 24) return `${n.toFixed(1)} h`;
  return `${(n / 24).toFixed(1)} d`;
};

function timeAgo(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return null;
  const diff = Date.now() - d.valueOf();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function AnalyticsDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloading, setReloading] = useState(false);

  const load = async () => {
    setReloading(true);
    try {
      const r = await fetch(`/api/analytics/campaigns/${id}`);
      const j = await r.json();
      if (j.success) {
        setData(j);
        setLoadError(null);
      } else setLoadError(j.error || "Failed to load");
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError) {
    return (
      <div className="py-12">
        <div className="surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-rose-700">
            Couldn't load campaign
          </p>
          <p className="text-[12px] text-ink-500 mt-1">{loadError}</p>
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 mt-4"
          >
            <ArrowLeft size={12} />
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12">
        <div className="surface px-6 py-10 text-center text-ink-500 text-sm">
          Loading insights…
        </div>
      </div>
    );
  }

  const { campaign, insights, uploads } = data;
  const empty = insights.totalEvents === 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase analytics-wider text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft size={11} />
            Campaigns
          </Link>
        }
        title={campaign.name}
        sub={
          empty
            ? "No events yet — upload your first CSV to populate this dashboard."
            : `${fmtInt(insights.totalEvents)} events · ${fmtInt(insights.uniqueUsers)} unique users · ${fmtInt(insights.transactions)} transactions · ${insights.firstSeen?.slice(0, 10)} → ${insights.lastSeen?.slice(0, 10)}`
        }
        right={
          <UploadButton
            campaignId={campaign.id}
            onUploaded={load}
            reloading={reloading}
          />
        }
      />

      {empty ? (
        <EmptyHint />
      ) : (
        <>
          <section className="mb-5">
            <KpiGrid insights={insights} />
          </section>

          <TabbedDetail
            insights={insights}
            uploads={uploads}
            campaign={campaign}
            onChanged={load}
          />
        </>
      )}
    </>
  );
}

// ── Tab orchestration ─────────────────────────────────────────────────────
// KPIs sit above this. Everything else gets sliced into six focused tabs so
// the page stays scannable instead of a half-mile of scroll.

const TABS = [
  { key: "overview", label: "Overview", icon: TrendingUp },
  { key: "explore", label: "Explore", icon: FileSpreadsheet },
  { key: "forecast", label: "Forecast", icon: Sigma },
  { key: "match", label: "Match Meta", icon: Link2 },
  { key: "users", label: "Users", icon: Users },
  { key: "geography", label: "Geography", icon: MapPin },
  { key: "device", label: "Device & source", icon: Smartphone },
  { key: "quality", label: "Quality", icon: AlertTriangle },
  { key: "uploads", label: "Uploads", icon: FileText },
];

function TabbedDetail({ insights, uploads, campaign, onChanged }) {
  const [active, setActive] = useState("overview");
  return (
    <>
      <div className="mb-4 border-b border-ink-200">
        <div className="flex items-center gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-emerald-700"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                <Icon size={13} />
                {t.label}
                {isActive && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-emerald-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {active === "overview" && (
        <OverviewTab insights={insights} campaignId={campaign.id} />
      )}
      {active === "explore" && <ExploreTab campaign={campaign} />}
      {active === "forecast" && <ForecastTab insights={insights} />}
      {active === "match" && (
        <MatchMetaTab campaign={campaign} onChanged={onChanged} />
      )}
      {active === "users" && <UsersTab insights={insights} />}
      {active === "geography" && <GeographyTab insights={insights} />}
      {active === "device" && <DeviceTab insights={insights} />}
      {active === "quality" && <QualityTab insights={insights} />}
      {active === "uploads" && (
        <UploadsTab
          uploads={uploads}
          campaign={campaign}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function OverviewTab({ insights, campaignId }) {
  const verdicts = useMemo(() => computeVerdicts(insights), [insights]);
  const [spendByDate, setSpendByDate] = useState(null);

  // Lazy-pull Meta-side daily spend so the daily-trend chart can overlay
  // Spend and Avg-per-conv lines when a Meta campaign is linked. Best
  // effort — if no Meta is linked, /match returns { linked: false } and
  // we just skip the overlay.
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    fetch(`/api/analytics/campaigns/${campaignId}/match`)
      .then((r) => r.text())
      .then((text) => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })
      .then((j) => {
        if (cancelled) return;
        if (j?.success && j.linked && Array.isArray(j.daily)) {
          const m = new Map();
          for (const d of j.daily) {
            if (d.date) m.set(d.date, d.spend || 0);
          }
          setSpendByDate(m.size > 0 ? m : null);
        } else {
          setSpendByDate(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSpendByDate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return (
    <div className="space-y-5 pb-10">
      {verdicts.length > 0 && <VerdictsCard verdicts={verdicts} />}
      <FunnelCard insights={insights} />
      {insights.dailyTrend.length > 1 && (
        <DailyTrendCard
          dailyTrend={insights.dailyTrend}
          spendByDate={spendByDate}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceSplitCard surfaceSplit={insights.surfaceSplit} />
        <DayOfWeekCard byDayOfWeek={insights.byDayOfWeek} />
      </div>
      <HourOfDayCard byHour={insights.byHour} />
    </div>
  );
}

// ── Verdict engine ─────────────────────────────────────────────────────────
// Reads the insights bundle and emits a small list of opinionated calls.
// Each verdict has a tone (good / warn / risk / info), a title, a short
// evidence sentence with the actual numbers, and one next action. The
// thresholds are deliberately blunt — better to over-trigger than to stay
// silent.

function computeVerdicts(insights) {
  const out = [];

  // 1) Funnel ─ where the leak is, or whether there isn't one.
  const f = insights.funnel || [];
  if (f.length >= 3 && f[0].count > 0) {
    const lmToCtc = f[1].rateFromPrev || 0;
    const ctcToBase = f[2].rateFromPrev || 0;
    const overallCr = f[2].rateFromFirst || 0;

    if (overallCr === 0 && f[0].count > 50) {
      out.push({
        id: "funnel",
        tone: "risk",
        icon: ShieldAlert,
        title: "Zero conversions despite traffic",
        body: `${fmtInt(f[0].count)} Learn-More clicks but no Base events fired. Either the conversion pixel is broken or the offer dead-ends.`,
        action: "Pause spend. Fire a test conversion end-to-end before resuming.",
      });
    } else if (lmToCtc < 0.3 && ctcToBase < 0.5 && f[0].count > 30) {
      out.push({
        id: "funnel",
        tone: "risk",
        icon: TrendingUp,
        title: "Funnel is leaking at both ends",
        body: `Only ${fmtPct(lmToCtc)} of Learn-More clicks reach CTC, and ${fmtPct(ctcToBase)} of those convert. Creative and CTA are both losing people.`,
        action: "Rework the landing-page hook first, then tighten the CTA copy. Don't add budget yet.",
      });
    } else if (lmToCtc < 0.3 && f[0].count > 30) {
      out.push({
        id: "funnel",
        tone: "warn",
        icon: TrendingUp,
        title: "Top of funnel is leaking",
        body: `Only ${fmtPct(lmToCtc)} of Learn-More clicks make it to CTC. Ad and landing page are mismatched.`,
        action: "Audit ad ↔ landing-page match. Faster load + stronger above-the-fold hook.",
      });
    } else if (ctcToBase < 0.5 && f[1].count > 30) {
      out.push({
        id: "funnel",
        tone: "warn",
        icon: TrendingUp,
        title: "CTA isn't closing",
        body: `${fmtPct(ctcToBase)} of CTC clicks convert. Intent is there — the last step is friction.`,
        action: "Shorten the form, pre-fill fields, and test phone-tap on mobile flows.",
      });
    } else if (overallCr >= 0.35) {
      out.push({
        id: "funnel",
        tone: "good",
        icon: Rocket,
        title: "Funnel is healthy end-to-end",
        body: `${fmtPct(overallCr)} of transactions reach Base. Both stages convert cleanly.`,
        action: "Safe to scale spend — focus on broader reach, not creative fixes.",
      });
    }
  }

  // 2) Surface (in-app vs native browser).
  const ss = insights.surfaceSplit || [];
  const inApp = ss.find((s) => s.key === "inApp");
  const web = ss.find((s) => s.key === "web");
  if (inApp && web && inApp.events + web.events > 100) {
    const iaCr = inApp.events > 0 ? inApp.conversions / inApp.events : 0;
    const webCr = web.events > 0 ? web.conversions / web.events : 0;
    const total = inApp.events + web.events;
    const iaShare = inApp.events / total;

    if (iaShare > 0.5 && webCr > 0 && iaCr > 0 && iaCr / webCr < 0.7) {
      out.push({
        id: "surface",
        tone: "warn",
        icon: Smartphone,
        title: "In-app browser is dragging conversion rate",
        body: `${fmtPct(iaShare)} of traffic is in-app, but CR there is ${fmtPct(iaCr, 2)} vs ${fmtPct(webCr, 2)} on the native browser.`,
        action: 'Force "Open in browser" or deeplink out of the in-app webview.',
      });
    } else if (iaShare > 0.5 && iaCr > 0 && iaCr >= webCr * 0.9) {
      out.push({
        id: "surface",
        tone: "good",
        icon: Smartphone,
        title: "In-app traffic is converting fine",
        body: `Most traffic (${fmtPct(iaShare)}) is in-app and CR is ${fmtPct(iaCr, 2)} — comparable to native browser.`,
        action: "No surface-break needed. Keep current settings.",
      });
    }
  }

  // 3) Geographic concentration.
  const g3 = insights.geoConcentrationTop3;
  if (g3 != null && insights.byState.length > 0 && insights.conversions >= 20) {
    const top = insights.byState[0];
    if (g3 > 0.7) {
      out.push({
        id: "geo",
        tone: "warn",
        icon: MapPin,
        title: `Revenue is leaning on ${top.key}`,
        body: `Top 3 states drive ${fmtPct(g3)} of conversions. ${top.key} alone leads with ${fmtInt(top.conversions)}.`,
        action: "Build lookalike audiences in adjacent states. Watch for ad fatigue in the leaders.",
      });
    } else if (g3 < 0.3) {
      out.push({
        id: "geo",
        tone: "info",
        icon: MapPin,
        title: "Revenue is geographically spread",
        body: `Top 3 states are only ${fmtPct(g3)} of conversions. No region carries the campaign.`,
        action: "Test region-targeted ad sets to find pockets with lower CPL.",
      });
    } else {
      out.push({
        id: "geo",
        tone: "good",
        icon: MapPin,
        title: "Healthy geographic mix",
        body: `Top 3 states are ${fmtPct(g3)} of conversions — diversified but not scattered.`,
        action: "No geo action needed — push on creative + timing.",
      });
    }
  }

  // 4) Latency — what kind of buyer journey are we actually running?
  const med = insights.medianLatencyHours;
  if (med != null && insights.conversions >= 10) {
    if (med < 5 / 60) {
      out.push({
        id: "latency",
        tone: "info",
        icon: Clock,
        title: "Users decide almost instantly",
        body: `Median click→conversion is ${fmtHrs(med)}. This is impulse-intent traffic.`,
        action: "Maximize impressions during peak hours. Retargeting after the moment is wasted budget.",
      });
    } else if (med > 24) {
      out.push({
        id: "latency",
        tone: "info",
        icon: Clock,
        title: "Consideration journey — they sleep on it",
        body: `Median click→conversion is ${fmtHrs(med)} (p90 ${fmtHrs(insights.p90LatencyHours)}). Half of buyers wait a day+.`,
        action: "Retargeting + reminder flows will move the needle more than fresh acquisition.",
      });
    }
  }

  // 5) Quality / fraud-ish signals.
  const q = insights.qualitySignals;
  if (q && insights.totalEvents > 100) {
    if (q.heavyIPEventShare != null && q.heavyIPEventShare > 0.35) {
      out.push({
        id: "quality",
        tone: "risk",
        icon: ShieldAlert,
        title: "Click clusters detected",
        body: `${fmtPct(q.heavyIPEventShare)} of events come from IPs with 5+ events each. That's a heavy power-user or click-farm signal.`,
        action: "Open the Users tab. If clusters share ISP + city, exclude them.",
      });
    } else if (
      q.instantConversionShare != null &&
      q.instantConversionShare > 0.5 &&
      med != null &&
      med < 1 / 60
    ) {
      out.push({
        id: "quality",
        tone: "risk",
        icon: ShieldAlert,
        title: "Suspicious instant conversions",
        body: `${fmtPct(q.instantConversionShare)} of conversions fire in seconds. Combined with sub-minute median latency, this smells automated.`,
        action: "Pause and audit. Verify on the Users tab whether one UA or IP block dominates.",
      });
    } else {
      out.push({
        id: "quality",
        tone: "good",
        icon: ShieldAlert,
        title: "Traffic looks clean",
        body: "No major click-cluster or automation signals. Quality metrics are within healthy bounds.",
        action: "Keep monitoring as volume grows. No remediation needed now.",
      });
    }
  }

  // 6) Time-of-day concentration.
  if (insights.byHour && insights.conversions >= 20) {
    const sorted = [...insights.byHour].sort(
      (a, b) => b.conversions - a.conversions,
    );
    const top4 = sorted.slice(0, 4);
    const top4Share =
      top4.reduce((s, h) => s + h.conversions, 0) / insights.conversions;
    if (top4Share > 0.6) {
      const hours = top4
        .map((h) => h.hour.toString().padStart(2, "0") + ":00")
        .join(", ");
      out.push({
        id: "hour",
        tone: "info",
        icon: Clock,
        title: "Conversions cluster in a 4-hour window",
        body: `${hours} drive ${fmtPct(top4Share)} of conversions. Peak: ${sorted[0].hour}:00.`,
        action: "Dayparting will help — shift budget into that window and trim spend outside it.",
      });
    }
  }

  // 7) Repeat-user verdict.
  if (insights.repeatUserShare != null && insights.uniqueUsers > 30) {
    if (insights.repeatUserShare > 0.2) {
      const rev =
        insights.revenueFromRepeat > 0
          ? ` ${fmtMoney(insights.revenueFromRepeat)} of revenue came from them.`
          : "";
      out.push({
        id: "repeat",
        tone: "good",
        icon: Repeat,
        title: "Users come back",
        body: `${fmtPct(insights.repeatUserShare)} of users had multiple transactions.${rev}`,
        action: "Build a custom audience from these IPs and run a retargeting ladder.",
      });
    } else if (insights.repeatUserShare < 0.03) {
      out.push({
        id: "repeat",
        tone: "info",
        icon: Repeat,
        title: "One-and-done audience",
        body: `Only ${fmtPct(insights.repeatUserShare)} of users return. No compounding value from repeat visits.`,
        action: "Acquisition is the only lever — invest in first-session CR optimization.",
      });
    }
  }

  // 8) Daily trend trajectory (last vs prior).
  if (insights.dailyTrend && insights.dailyTrend.length >= 4) {
    const days = insights.dailyTrend;
    const last = days[days.length - 1];
    const prior = days.slice(-4, -1);
    const priorAvg =
      prior.reduce((s, d) => s + d.conversions, 0) / prior.length || 0;
    if (priorAvg > 0) {
      const delta = (last.conversions - priorAvg) / priorAvg;
      if (delta > 0.4) {
        out.push({
          id: "trend",
          tone: "good",
          icon: Rocket,
          title: "Latest day is trending up sharply",
          body: `${fmtInt(last.conversions)} conversions on ${last.date} vs ${priorAvg.toFixed(1)}/day average over the prior 3.`,
          action: "Check what changed (creative? budget?) and double down before the spike cools.",
        });
      } else if (delta < -0.4) {
        out.push({
          id: "trend",
          tone: "warn",
          icon: TrendingUp,
          title: "Latest day fell off a cliff",
          body: `${fmtInt(last.conversions)} conversions on ${last.date} vs ${priorAvg.toFixed(1)}/day average over the prior 3.`,
          action: "Check ad delivery + creative fatigue. If it persists tomorrow, refresh assets.",
        });
      }
    }
  }

  return out;
}

const VERDICT_TONES = {
  good: {
    ring: "ring-emerald-200",
    bg: "bg-emerald-50/60",
    icon: "bg-emerald-100 text-emerald-700",
    tag: "text-emerald-700 bg-emerald-100",
    label: "Healthy",
  },
  warn: {
    ring: "ring-amber-200",
    bg: "bg-amber-50/60",
    icon: "bg-amber-100 text-amber-700",
    tag: "text-amber-700 bg-amber-100",
    label: "Watch",
  },
  risk: {
    ring: "ring-rose-200",
    bg: "bg-rose-50/60",
    icon: "bg-rose-100 text-rose-700",
    tag: "text-rose-700 bg-rose-100",
    label: "Risk",
  },
  info: {
    ring: "ring-brand-200",
    bg: "bg-brand-50/40",
    icon: "bg-brand-100 text-brand-700",
    tag: "text-brand-700 bg-brand-100",
    label: "Note",
  },
};

function VerdictsCard({ verdicts }) {
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-4">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-amber-300">
          <Lightbulb size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Verdicts & next moves
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Opinionated read of the data. Each card states what's happening,
            why it matters, and the single next action to take.
          </p>
        </div>
      </div>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {verdicts.map((v) => {
          const tone = VERDICT_TONES[v.tone] || VERDICT_TONES.info;
          const Icon = v.icon || Info;
          return (
            <li
              key={v.id}
              className={`rounded-lg ring-1 ${tone.ring} ${tone.bg} px-3.5 py-3`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg ${tone.icon}`}
                >
                  <Icon size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-[12.5px] font-bold text-ink-900 leading-tight">
                      {v.title}
                    </p>
                    <span
                      className={`text-[9.5px] font-bold uppercase analytics-wider rounded-full px-1.5 py-0.5 ${tone.tag} whitespace-nowrap`}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-ink-700 leading-relaxed">
                    {v.body}
                  </p>
                  {v.action && (
                    <p className="text-[11px] text-ink-900 mt-1.5 leading-relaxed">
                      <span className="font-bold">Next:</span> {v.action}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Forecast tab ──────────────────────────────────────────────────────────
// Math-driven projection of the next ~14 days. Linear regression on
// events / conversions / revenue, day-of-week multipliers applied, with
// 68% and 95% prediction-interval bands rendered as shaded cones.

function ForecastTab({ insights }) {
  const horizon = 14;
  const f = useMemo(
    () => computeForecast(insights.dailyTrend, { horizon }),
    [insights.dailyTrend, horizon],
  );

  if (!f.ready) {
    return (
      <div className="surface px-6 py-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-500 mb-3">
          <Sigma size={18} />
        </span>
        <p className="text-sm font-bold text-ink-900">
          Not enough data to forecast yet
        </p>
        <p className="text-[12px] text-ink-500 mt-1 max-w-md mx-auto leading-relaxed">
          {f.reason}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <ForecastIntro nDays={f.nDays} horizon={horizon} />
      <ForecastHeadlineGrid headlines={f.headlines} />
      <ForecastStatsCard regression={f.regression} seasonality={f.seasonality} />
      <ForecastChart
        history={f.history}
        forecast={f.forecast}
        metric="conversions"
        color="#1877f2"
        title="Conversions — projected daily"
        sub="Solid: actual. Dashed: projection. Shaded cones are 68% and 95% prediction intervals."
      />
      <ForecastChart
        history={f.history}
        forecast={f.forecast}
        metric="revenue"
        color="#10b981"
        title="Revenue — projected daily (USD)"
        sub="Same regression, applied to daily revenue, with day-of-week multiplier."
        money
      />
      <CumulativeChart cumulative={f.cumulative} milestones={f.milestones} />
      <ForecastVerdictsCard forecast={f} />
    </div>
  );
}

function ForecastIntro({ nDays, horizon }) {
  return (
    <div className="rounded-xl ring-1 ring-brand-200 bg-brand-50/40 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Sigma size={14} />
        </span>
        <div>
          <p className="text-[12.5px] font-bold text-ink-900 leading-tight">
            How this forecast is built
          </p>
          <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed max-w-3xl">
            {nDays} days of daily data → ordinary least-squares regression
            on each metric, multiplied by day-of-week seasonal adjustment.
            Projection cone is the textbook ±1σ (≈ 68%) and ±2σ (≈ 95%)
            prediction-interval formula:{" "}
            <span className="font-mono text-[10.5px]">
              ŷ ± z·s·√(1 + 1/n + (t−t̄)²/Sxx)
            </span>
            . Horizon: {horizon} days.
          </p>
        </div>
      </div>
    </div>
  );
}

function ForecastHeadlineGrid({ headlines }) {
  const tiles = [
    {
      label: "Next 7 days — revenue",
      mid: fmtMoney(headlines.next7.revenue),
      sub: `95% CI: ${fmtMoney(headlines.next7.revenueLo)} → ${fmtMoney(
        headlines.next7.revenueHi,
      )}`,
      tone: "emerald",
    },
    {
      label: "Next 14 days — revenue",
      mid: fmtMoney(headlines.next14.revenue),
      sub: `95% CI: ${fmtMoney(headlines.next14.revenueLo)} → ${fmtMoney(
        headlines.next14.revenueHi,
      )}`,
      tone: "emerald",
    },
    {
      label: "Next 7 days — conversions",
      mid: Math.round(headlines.next7.conversions).toLocaleString("en-US"),
      sub: `95% CI: ${Math.round(headlines.next7.conversionsLo).toLocaleString("en-US")} → ${Math.round(headlines.next7.conversionsHi).toLocaleString("en-US")}`,
      tone: "brand",
    },
    {
      label: "Next 14 days — conversions",
      mid: Math.round(headlines.next14.conversions).toLocaleString("en-US"),
      sub: `95% CI: ${Math.round(headlines.next14.conversionsLo).toLocaleString("en-US")} → ${Math.round(headlines.next14.conversionsHi).toLocaleString("en-US")}`,
      tone: "brand",
    },
  ];
  const TONE = {
    emerald: "bg-emerald-50 ring-emerald-200 text-emerald-800",
    brand: "bg-brand-50 ring-brand-200 text-brand-800",
  };
  return (
    <ul className="grid gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <li
          key={t.label}
          className={`rounded-lg ring-1 ${TONE[t.tone]} px-3.5 py-3`}
        >
          <p className="text-[10.5px] font-bold uppercase analytics-wider text-ink-500">
            {t.label}
          </p>
          <p className="text-2xl font-bold tabular text-ink-900 mt-0.5 leading-tight">
            {t.mid}
          </p>
          <p className="text-[10.5px] text-ink-500 mt-1 leading-snug tabular">
            {t.sub}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ForecastStatsCard({ regression, seasonality }) {
  const rows = [
    ["Events", regression.events],
    ["Conversions", regression.conversions],
    ["Revenue", regression.revenue],
  ];
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Sigma size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Model fit & stats
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Mean ± std, regression slope per day, R² fit quality, slope
            t-statistic (|t| &gt; 2 ≈ statistically significant at 95%), and
            weekly seasonality strength (CV across day-of-week multipliers).
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100">
              <th className="py-2 font-semibold">Metric</th>
              <th className="py-2 font-semibold text-right">Daily mean</th>
              <th className="py-2 font-semibold text-right">Std dev</th>
              <th className="py-2 font-semibold text-right">CV</th>
              <th className="py-2 font-semibold text-right">Slope/day</th>
              <th className="py-2 font-semibold text-right">R²</th>
              <th className="py-2 font-semibold text-right">|t|</th>
              <th className="py-2 font-semibold text-right">DoW CV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, r]) => {
              const sig = Math.abs(r.tStat) > 2;
              const dowKey = label.toLowerCase();
              return (
                <tr
                  key={label}
                  className="border-b border-ink-100 last:border-0"
                >
                  <td className="py-2 font-semibold text-ink-900">{label}</td>
                  <td className="py-2 text-right tabular text-ink-900">
                    {label === "Revenue"
                      ? fmtMoney(r.meanY)
                      : r.meanY.toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {label === "Revenue"
                      ? fmtMoney(r.stdY)
                      : r.stdY.toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {r.cv != null ? r.cv.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`py-2 text-right tabular font-bold ${
                      r.slope > 0
                        ? "text-emerald-700"
                        : r.slope < 0
                          ? "text-rose-700"
                          : "text-ink-700"
                    }`}
                  >
                    {r.slope > 0 ? "+" : ""}
                    {label === "Revenue"
                      ? fmtMoney(r.slope)
                      : r.slope.toFixed(3)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {(r.r2 * 100).toFixed(0)}%
                  </td>
                  <td
                    className={`py-2 text-right tabular ${
                      sig ? "font-bold text-emerald-700" : "text-ink-500"
                    }`}
                  >
                    {Math.abs(r.tStat).toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {(seasonality[dowKey] * 100).toFixed(0)}%
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

function ForecastChart({
  history,
  forecast,
  metric,
  color,
  title,
  sub,
  money = false,
}) {
  // Merge history + forecast into one series the chart can render. We
  // store the actual line and the projected line as separate keys so
  // Recharts can break the line at the seam.
  const data = useMemo(() => {
    const rows = [];
    for (const h of history) {
      rows.push({
        date: h.date,
        actual: h[metric],
        projected: null,
        band68: null,
        band95: null,
      });
    }
    // Bridge point so the projected line starts where actual ended.
    if (history.length > 0) {
      const last = history[history.length - 1];
      rows[rows.length - 1].projected = last[metric];
      rows[rows.length - 1].band68 = [last[metric], last[metric]];
      rows[rows.length - 1].band95 = [last[metric], last[metric]];
    }
    for (const f of forecast) {
      rows.push({
        date: f.date,
        actual: null,
        projected: f[metric],
        band68: [f[`${metric}Lo68`], f[`${metric}Hi68`]],
        band95: [f[`${metric}Lo95`], f[`${metric}Hi95`]],
      });
    }
    return rows;
  }, [history, forecast, metric]);

  const seamDate = history[history.length - 1]?.date;
  const tickFmt = (v) =>
    money
      ? v >= 1000
        ? `$${(v / 1000).toFixed(1)}k`
        : `$${Math.round(v)}`
      : Math.round(v).toLocaleString("en-US");
  const tooltipFmt = (v) =>
    money ? fmtMoney(v) : Math.round(v).toLocaleString("en-US");

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Activity size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            {title}
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            {sub}
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => d.slice(5)}
            tick={{ fontSize: 11, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickFmt}
            width={48}
          />
          <Tooltip
            content={
              <MinimalTooltip formatter={(v) => (v == null ? "—" : tooltipFmt(v))} />
            }
          />
          {seamDate && (
            <ReferenceLine
              x={seamDate}
              stroke="#a3a8ad"
              strokeDasharray="3 3"
              label={{
                value: "today",
                position: "insideTopRight",
                fontSize: 10,
                fill: "#8a8d91",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="band95"
            stroke="none"
            fill={color}
            fillOpacity={0.08}
            isAnimationActive={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="band68"
            stroke="none"
            fill={color}
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke={color}
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CumulativeChart({ cumulative, milestones }) {
  const data = useMemo(
    () =>
      cumulative.map((c) => ({
        date: c.date,
        actualCum: c.isActual ? c.cum : null,
        projCum: c.isActual ? c.cum : c.proj,
        band68: c.isActual ? null : [c.lo68, c.hi68],
        band95: c.isActual ? null : [c.lo95, c.hi95],
      })),
    [cumulative],
  );
  // Find seam date (last actual day)
  const seamDate = useMemo(() => {
    const last = cumulative.filter((c) => c.isActual).at(-1);
    return last?.date;
  }, [cumulative]);

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Flag size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Cumulative revenue — actual + projection
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Running revenue total, projected forward with prediction-interval
            cones. Milestones below assume the trend holds.
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => d.slice(5)}
            tick={{ fontSize: 11, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`
            }
            width={56}
          />
          <Tooltip
            content={
              <MinimalTooltip
                formatter={(v) => (v == null ? "—" : fmtMoney(v))}
              />
            }
          />
          {seamDate && (
            <ReferenceLine
              x={seamDate}
              stroke="#a3a8ad"
              strokeDasharray="3 3"
              label={{
                value: "today",
                position: "insideTopRight",
                fontSize: 10,
                fill: "#8a8d91",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="band95"
            stroke="none"
            fill="#10b981"
            fillOpacity={0.08}
            isAnimationActive={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="band68"
            stroke="none"
            fill="#10b981"
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actualCum"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="projCum"
            stroke="#10b981"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {milestones.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {milestones.map((m) => (
            <li
              key={m.target}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-800"
            >
              <Flag size={11} />
              {fmtMoney(m.target)} milestone in ~{m.days} day
              {m.days === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ForecastVerdictsCard({ forecast }) {
  const v = computeForecastVerdicts(forecast);
  if (v.length === 0) return null;
  return <VerdictsCard verdicts={v} />;
}

function computeForecastVerdicts(f) {
  const out = [];
  const { regression, seasonality, levelShift, autocorr, nDays } = f;

  // Trend significance for revenue.
  const rev = regression.revenue;
  const conv = regression.conversions;

  if (Math.abs(rev.tStat) > 2 && rev.slope > 0) {
    out.push({
      id: "trend-up",
      tone: "good",
      icon: TrendingUp,
      title: `Revenue is on a statistically significant uptrend`,
      body: `Slope is +${fmtMoney(rev.slope)}/day with |t|=${rev.tStat.toFixed(
        2,
      )} (R²=${(rev.r2 * 100).toFixed(0)}%). The improvement is unlikely to be random noise.`,
      action: "Keep the creative + budget steady — let the trend compound before changing things.",
    });
  } else if (Math.abs(rev.tStat) > 2 && rev.slope < 0) {
    out.push({
      id: "trend-down",
      tone: "risk",
      icon: ShieldAlert,
      title: `Revenue is on a statistically significant downtrend`,
      body: `Slope is ${fmtMoney(rev.slope)}/day with |t|=${rev.tStat.toFixed(
        2,
      )} (R²=${(rev.r2 * 100).toFixed(0)}%). This isn't random noise.`,
      action: "Refresh creative + audit landing-page conversion rate before the projection bottoms out.",
    });
  } else if (Math.abs(rev.tStat) <= 1 && nDays >= 7) {
    out.push({
      id: "trend-flat",
      tone: "info",
      icon: Info,
      title: "Revenue is essentially flat",
      body: `Slope (${fmtMoney(rev.slope)}/day) isn't distinguishable from zero given the noise (|t|=${rev.tStat.toFixed(2)}).`,
      action: "Don't chase noise. Test a creative or offer change to actually move the line.",
    });
  }

  // Volatility — wide CV means the forecast cones are huge and the
  // headline numbers should be read with skepticism.
  if (conv.cv != null && conv.cv > 0.6 && nDays >= 5) {
    out.push({
      id: "vol",
      tone: "warn",
      icon: AlertTriangle,
      title: "High day-to-day volatility",
      body: `Conversions coefficient of variation is ${conv.cv.toFixed(2)} — daily counts swing more than they trend. Prediction intervals will be wide.`,
      action: "Read the cone, not the central line. The 95% band is the realistic range.",
    });
  }

  // Weekly seasonality.
  if (seasonality.conversions > 0.25) {
    out.push({
      id: "season",
      tone: "info",
      icon: Calendar,
      title: "Strong weekly seasonality detected",
      body: `Day-of-week swings explain a ${(seasonality.conversions * 100).toFixed(0)}% spread around the mean. The forecast already applies the weekday multipliers.`,
      action: "Lean weekday-specific budget toward the strong days — see the Day-of-week chart in Overview.",
    });
  }

  // Level shift in the last 3 days vs prior.
  if (levelShift.revenue != null && Math.abs(levelShift.revenue) > 0.4) {
    if (levelShift.revenue > 0) {
      out.push({
        id: "shift-up",
        tone: "good",
        icon: Rocket,
        title: "Recent step-up in revenue",
        body: `Last 3 days are ${(levelShift.revenue * 100).toFixed(0)}% above the prior mean. The trendline hasn't fully absorbed it yet — actuals may keep outrunning the cone center.`,
        action: "Whatever changed recently is working. Identify the lever (creative, audience, time-of-day) and protect it.",
      });
    } else {
      out.push({
        id: "shift-down",
        tone: "warn",
        icon: AlertTriangle,
        title: "Recent step-down in revenue",
        body: `Last 3 days are ${(levelShift.revenue * 100).toFixed(0)}% below the prior mean. Forecast cone is anchored on the older data and will read high.`,
        action: "Diagnose the recent drop. Don't trust 'next 7 days' headline until the regression catches up.",
      });
    }
  }

  // Autocorrelation note — if yesterday strongly predicts today (lag-1
  // autocorr ≈ 1), residuals aren't iid and the cone underestimates risk.
  if (autocorr.revenue > 0.6) {
    out.push({
      id: "autocorr",
      tone: "info",
      icon: Info,
      title: "Strong day-to-day momentum (autocorrelation)",
      body: `Lag-1 autocorrelation on revenue is ${autocorr.revenue.toFixed(2)}. Yesterday strongly predicts today, which the simple linear model doesn't account for.`,
      action: "Treat the prediction cone as a lower bound on uncertainty — real swings can persist longer than the model expects.",
    });
  }

  // Small-n disclaimer.
  if (nDays < 7) {
    out.push({
      id: "small-n",
      tone: "warn",
      icon: AlertTriangle,
      title: `Forecast is from only ${nDays} days of data`,
      body: "With this little history the prediction intervals are wide and the model can't pick up weekly seasonality reliably.",
      action: "Upload another week of CSVs to sharpen the projection.",
    });
  }

  return out;
}

// ── Explore tab ───────────────────────────────────────────────────────────
// Excel-style data explorer. Two modes:
//  • Pivot — pick a dimension, see every value bucketed with conversions,
//    revenue, share, cumulative %, avg/conv, rev/event, conv-rate. Click
//    any column header to flip sort direction. Search by dimension value.
//    Top-N bar chart on the side. CSV export of whatever's on screen.
//  • Raw  — every event in the campaign as a sortable, searchable,
//    paginated table. Filter to Base / LM / CTC, sort by date, revenue,
//    or latency.

const DIMENSIONS = [
  { key: "region", label: "State / region", get: (e) => e.region },
  { key: "city", label: "City", get: (e) => e.city },
  { key: "country", label: "Country", get: (e) => e.country },
  {
    key: "dma",
    label: "DMA",
    get: (e) => (e.dma && e.dma !== "0" ? e.dma : ""),
  },
  { key: "device_type", label: "Device type", get: (e) => e.device_type },
  { key: "platform", label: "Platform (OS)", get: (e) => e.platform },
  { key: "os_version", label: "OS version", get: (e) => e.os_version },
  { key: "brand", label: "Device brand", get: (e) => e.brand },
  { key: "browser", label: "Browser / source", get: (e) => e.browser },
  { key: "carrier", label: "Carrier", get: (e) => e.carrier },
  { key: "isp", label: "ISP", get: (e) => e.isp },
  { key: "language", label: "Language", get: (e) => e.language },
  { key: "sub1", label: "Sub1 (offer code)", get: (e) => e.sub1 },
  { key: "offer_name", label: "Offer name", get: (e) => e.offer_name },
  { key: "revenue_type", label: "Revenue type", get: (e) => e.revenue_type },
  { key: "network_id", label: "Network ID", get: (e) => e.network_id },
  {
    key: "dayOfWeek",
    label: "Day of week",
    get: (e) => {
      if (!e.date) return "";
      const d = new Date(e.date.replace(" ", "T") + "Z");
      if (Number.isNaN(d.valueOf())) return "";
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    },
  },
  {
    key: "hour",
    label: "Hour of day (UTC)",
    get: (e) => {
      const m = (e.date || "").match(/\s(\d{2}):/);
      return m ? `${m[1]}:00` : "";
    },
  },
  {
    key: "date",
    label: "Date (UTC)",
    get: (e) => (e.date || "").slice(0, 10),
  },
  {
    key: "latencyBucket",
    label: "Latency bucket",
    get: (e) => {
      const h = parseFloat(e.delta_hours);
      if (!Number.isFinite(h) || h < 0) return "";
      if (h <= 1 / 60) return "Under 1 min";
      if (h <= 5 / 60) return "1–5 min";
      if (h <= 30 / 60) return "5–30 min";
      if (h <= 2) return "30 min – 2 h";
      if (h <= 24) return "2 h – 24 h";
      if (h <= 24 * 7) return "1–7 days";
      return "Over 7 days";
    },
  },
];

function ExploreTab({ campaign }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("pivot");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/campaigns/${campaign.id}/events`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setEvents(j.events);
        else setError(j?.error || "Failed to load events");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [campaign.id]);

  if (loading) {
    return (
      <div className="surface px-6 py-10 text-center text-ink-500 text-sm">
        Loading events…
      </div>
    );
  }
  if (error) {
    return (
      <div className="surface px-6 py-10 text-center">
        <p className="text-sm font-bold text-rose-700">Couldn't load events</p>
        <p className="text-[12px] text-ink-500 mt-1">{error}</p>
      </div>
    );
  }
  if (!events || events.length === 0) {
    return (
      <div className="surface px-6 py-10 text-center text-ink-500 text-sm">
        No events to explore — upload a CSV first.
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <ExploreHeadline events={events} />
      <ExploreModeBar mode={mode} setMode={setMode} count={events.length} />
      {mode === "pivot" && <PivotView events={events} />}
      {mode === "crosstab" && <CrosstabView events={events} />}
      {mode === "raw" && <RawView events={events} />}
    </div>
  );
}

function ExploreHeadline({ events }) {
  const stats = useMemo(() => {
    let convs = 0;
    let lm = 0;
    let ctc = 0;
    let revenue = 0;
    for (const e of events) {
      if (e.event_name === "Base") {
        convs += 1;
        const r = parseFloat(e.revenue);
        if (Number.isFinite(r)) revenue += r;
      } else if (e.event_name === "Learn More Clicked") {
        lm += 1;
      } else if (e.event_name === "CTC Clicked") {
        ctc += 1;
      }
    }
    return { convs, lm, ctc, revenue };
  }, [events]);

  const lmToConv = stats.lm > 0 ? stats.convs / stats.lm : null;

  const tiles = [
    { label: "Total revenue", value: fmtMoney(stats.revenue) },
    {
      label: "Conversions (Base)",
      value: fmtInt(stats.convs),
      sub:
        stats.convs > 0
          ? `${fmtMoney(stats.revenue / stats.convs)} avg / conv`
          : null,
    },
    {
      label: "Learn-More",
      value: fmtInt(stats.lm),
      sub:
        lmToConv != null
          ? `${fmtPct(lmToConv, 1)} → Base · ${fmtInt(stats.ctc)} CTC`
          : null,
    },
    {
      label: "Events on disk",
      value: fmtInt(events.length),
      sub: "active uploads only",
    },
  ];

  return (
    <ul className="grid gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.label} className="surface px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase analytics-wider text-ink-500">
            {t.label}
          </p>
          <p className="text-2xl font-bold tabular text-ink-900 leading-tight mt-0.5">
            {t.value}
          </p>
          {t.sub && (
            <p className="text-[11px] text-ink-500 mt-1 leading-tight">
              {t.sub}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ExploreModeBar({ mode, setMode, count }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 p-0.5">
        {[
          { k: "pivot", l: "Pivot · 1 dim" },
          { k: "crosstab", l: "Crosstab · 2 dim" },
          { k: "raw", l: "Raw events" },
        ].map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setMode(o.k)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors ${
              mode === o.k
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-800"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-ink-500">
        {fmtInt(count)} event{count === 1 ? "" : "s"} loaded
      </p>
    </div>
  );
}

// ── Pivot mode ────────────────────────────────────────────────────────────

const PIVOT_COLUMNS = [
  { key: "key", label: "Dimension", align: "left", fmt: (v) => v || "—" },
  { key: "events", label: "Events", fmt: (v) => fmtInt(v) },
  { key: "conv", label: "Conv", fmt: (v) => fmtInt(v) },
  { key: "convShare", label: "Conv %", fmt: (v) => fmtPct(v, 1) },
  { key: "convRate", label: "Conv-rate", fmt: (v) => fmtPct(v, 2) },
  { key: "lm", label: "LM clicks", fmt: (v) => fmtInt(v) },
  { key: "ctc", label: "CTC", fmt: (v) => fmtInt(v) },
  { key: "revenue", label: "Revenue", fmt: (v) => fmtMoney(v) },
  { key: "revShare", label: "Rev %", fmt: (v) => fmtPct(v, 1) },
  { key: "cumRevShare", label: "Cum %", fmt: (v) => fmtPct(v, 1) },
  { key: "avgRev", label: "Avg / conv", fmt: (v) => fmtMoney(v) },
  { key: "revPerEvent", label: "Rev / event", fmt: (v) => fmtMoney(v) },
];

function PivotView({ events }) {
  const [groupBy, setGroupBy] = useState("region");
  const [sortBy, setSortBy] = useState("revenue");
  const [sortDir, setSortDir] = useState("desc");
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(25);

  const dim = DIMENSIONS.find((d) => d.key === groupBy) || DIMENSIONS[0];

  const aggregated = useMemo(() => {
    const map = new Map();
    let totalConv = 0;
    let totalRev = 0;
    let totalEvents = 0;
    for (const e of events) {
      const raw = dim.get(e);
      const key = (raw ?? "").toString().trim();
      if (!key) continue;
      const cur =
        map.get(key) || {
          key,
          events: 0,
          conv: 0,
          lm: 0,
          ctc: 0,
          revenue: 0,
        };
      cur.events += 1;
      if (e.event_name === "Base") {
        cur.conv += 1;
        const r = parseFloat(e.revenue);
        if (Number.isFinite(r)) cur.revenue += r;
      } else if (e.event_name === "Learn More Clicked") {
        cur.lm += 1;
      } else if (e.event_name === "CTC Clicked") {
        cur.ctc += 1;
      }
      map.set(key, cur);
    }
    const rows = Array.from(map.values());
    for (const r of rows) {
      totalConv += r.conv;
      totalRev += r.revenue;
      totalEvents += r.events;
    }
    return { rows, totalConv, totalRev, totalEvents };
  }, [events, dim]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? aggregated.rows.filter((r) => r.key.toLowerCase().includes(q))
      : aggregated.rows;
  }, [aggregated.rows, filter]);

  // Build the table in three explicit passes so every column ends up with
  // a numeric value BEFORE the sort comparator runs.
  //
  // Pass 1 — per-row derivations that don't depend on sort order (shares,
  //   rates, averages).
  // Pass 2 — sort. Now the comparator sees real numbers on every key.
  // Pass 3 — cumulative columns (cum %, cum conv %), which only make
  //   sense once the rows are in their final order.
  const decorated = useMemo(() => {
    const { totalConv, totalRev } = aggregated;

    const withDerived = filtered.map((r) => ({
      ...r,
      convShare: totalConv > 0 ? r.conv / totalConv : 0,
      revShare: totalRev > 0 ? r.revenue / totalRev : 0,
      avgRev: r.conv > 0 ? r.revenue / r.conv : 0,
      revPerEvent: r.events > 0 ? r.revenue / r.events : 0,
      convRate: r.events > 0 ? r.conv / r.events : 0,
    }));

    const sorted = [...withDerived].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      // Treat null / undefined as "smaller than everything else", so when
      // sorting desc they sink to the bottom (which is what you want).
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });

    let cumRev = 0;
    let cumConv = 0;
    return sorted.map((r) => {
      cumRev += r.revenue;
      cumConv += r.conv;
      return {
        ...r,
        cumRevShare: totalRev > 0 ? cumRev / totalRev : 0,
        cumConvShare: totalConv > 0 ? cumConv / totalConv : 0,
      };
    });
  }, [filtered, sortBy, sortDir, aggregated]);

  const visible = limit === -1 ? decorated : decorated.slice(0, limit);
  const topN = decorated.slice(0, 10);

  const toggleSort = (col) => {
    if (col === sortBy) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir(
        col === "key" ? "asc" : "desc",
      );
    }
  };

  const exportCsv = () => {
    const headers = PIVOT_COLUMNS.map((c) =>
      c.key === "key" ? dim.label : c.label,
    );
    const lines = [headers.join(",")];
    for (const r of decorated) {
      const cells = PIVOT_COLUMNS.map((c) => {
        const v = r[c.key];
        if (typeof v === "number") return v.toString();
        const s = (v ?? "").toString().replace(/"/g, '""');
        return s.includes(",") || s.includes('"') ? `"${s}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pivot-${dim.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="surface px-4 py-3.5">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Group by
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Filter values
            </label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Search ${dim.label.toLowerCase()}…`}
                className="w-full rounded-lg ring-1 ring-ink-200 bg-white pl-7 pr-3 py-1.5 text-[12.5px] text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Show
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
              <option value={-1}>All ({decorated.length})</option>
            </select>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[12px] font-semibold px-3 py-1.5 hover:bg-ink-50"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>

      {topN.length > 0 && (
        <PivotTopChart rows={topN} dimLabel={dim.label} />
      )}

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="py-2 px-2 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider w-10">
                  #
                </th>
                {PIVOT_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`py-2 px-2 font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider whitespace-nowrap select-none ${
                      c.align === "left" ? "text-left" : "text-right"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 ${
                        sortBy === c.key
                          ? "text-ink-900"
                          : "text-ink-500 hover:text-ink-800"
                      } ${c.align === "left" ? "" : "flex-row-reverse"}`}
                    >
                      {c.key === "key" ? dim.label : c.label}
                      <SortIcon
                        active={sortBy === c.key}
                        dir={sortBy === c.key ? sortDir : null}
                      />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={PIVOT_COLUMNS.length + 1}
                    className="py-6 text-center text-ink-500 text-[12px] italic"
                  >
                    No rows match the filter.
                  </td>
                </tr>
              ) : (
                visible.map((r, idx) => (
                  <tr
                    key={r.key + idx}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60"
                  >
                    <td className="py-2 px-2 text-ink-500 tabular text-[11px]">
                      {idx + 1}
                    </td>
                    {PIVOT_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`py-2 px-2 tabular ${
                          c.align === "left"
                            ? "text-left text-ink-900 font-semibold"
                            : "text-right text-ink-700"
                        } ${
                          c.key === "revenue" || c.key === "revShare"
                            ? "text-ink-900 font-bold"
                            : ""
                        }`}
                      >
                        {c.fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {decorated.length > 0 && (
              <tfoot className="bg-ink-50 border-t border-ink-200">
                <tr>
                  {/* # */}
                  <td className="py-2 px-2 text-[11px] font-bold uppercase analytics-wider text-ink-500">
                    Σ
                  </td>
                  {/* Dimension */}
                  <td className="py-2 px-2 text-left text-[11.5px] font-bold text-ink-900">
                    {decorated.length} rows · showing {visible.length}
                  </td>
                  {/* Events */}
                  <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                    {fmtInt(decorated.reduce((s, r) => s + r.events, 0))}
                  </td>
                  {/* Conv */}
                  <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                    {fmtInt(aggregated.totalConv)}
                  </td>
                  {/* Conv %, Conv-rate */}
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2" />
                  {/* LM clicks */}
                  <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                    {fmtInt(decorated.reduce((s, r) => s + r.lm, 0))}
                  </td>
                  {/* CTC */}
                  <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                    {fmtInt(decorated.reduce((s, r) => s + r.ctc, 0))}
                  </td>
                  {/* Revenue */}
                  <td className="py-2 px-2 text-right tabular font-bold text-emerald-700">
                    {fmtMoney(aggregated.totalRev)}
                  </td>
                  {/* Rev %, Cum %, Avg/conv, Rev/event */}
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown size={10} className="text-ink-400" />;
  return dir === "desc" ? (
    <ArrowDown size={10} />
  ) : (
    <ArrowUp size={10} />
  );
}

function PivotTopChart({ rows, dimLabel }) {
  const data = rows.map((r) => ({
    name: r.key.length > 22 ? r.key.slice(0, 20) + "…" : r.key,
    revenue: Math.round(r.revenue * 100) / 100,
    conv: r.conv,
  }));
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Activity size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Top {data.length} by revenue · {dimLabel}
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5">
            Revenue (emerald) + conversion count (brand) per dimension value.
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="#f0f2f5" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
            }
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10, fill: "#3a3b3c" }}
            axisLine={false}
            tickLine={false}
            width={130}
          />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            content={
              <MinimalTooltip
                formatter={(v, name) =>
                  name === "revenue" ? fmtMoney(v) : fmtInt(v)
                }
              />
            }
          />
          <Bar dataKey="revenue" fill="#10b981" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Crosstab mode (rows × columns × metric) ───────────────────────────────
// Excel pivot table classic: pick two dimensions, get a matrix of the
// selected metric. Cells heatmap-shaded by value so patterns jump out.
// Click any column header to re-sort rows by that column.

const METRICS = [
  { key: "revenue", label: "Revenue ($)", fmt: (v) => fmtMoney(v) },
  { key: "conv", label: "Conversions", fmt: (v) => fmtInt(v) },
  { key: "events", label: "Events", fmt: (v) => fmtInt(v) },
  { key: "lm", label: "Learn-More clicks", fmt: (v) => fmtInt(v) },
  {
    key: "avgRev",
    label: "Avg revenue / conv",
    fmt: (v) => (v > 0 ? fmtMoney(v) : "—"),
  },
  {
    key: "revPerEvent",
    label: "Revenue / event",
    fmt: (v) => (v > 0 ? fmtMoney(v) : "—"),
  },
  {
    key: "convRate",
    label: "Conversion rate",
    fmt: (v) => (v > 0 ? fmtPct(v, 2) : "—"),
  },
];

function metricValue(agg, metric) {
  if (!agg) return 0;
  switch (metric) {
    case "revenue":
      return agg.revenue;
    case "conv":
      return agg.conv;
    case "events":
      return agg.events;
    case "lm":
      return agg.lm;
    case "avgRev":
      return agg.conv > 0 ? agg.revenue / agg.conv : 0;
    case "revPerEvent":
      return agg.events > 0 ? agg.revenue / agg.events : 0;
    case "convRate":
      return agg.events > 0 ? agg.conv / agg.events : 0;
    default:
      return 0;
  }
}

function emptyAgg() {
  return { events: 0, conv: 0, lm: 0, ctc: 0, revenue: 0 };
}

function mergeAgg(a, b) {
  a.events += b.events;
  a.conv += b.conv;
  a.lm += b.lm;
  a.ctc += b.ctc;
  a.revenue += b.revenue;
}

function buildCrosstab(events, rDim, cDim) {
  // grid[rowKey][colKey] = agg
  const grid = new Map();
  const colSet = new Set();
  for (const e of events) {
    const rk = (rDim.get(e) ?? "").toString().trim();
    const ck = (cDim.get(e) ?? "").toString().trim();
    if (!rk || !ck) continue;
    colSet.add(ck);
    if (!grid.has(rk)) grid.set(rk, new Map());
    const colMap = grid.get(rk);
    const cur = colMap.get(ck) || emptyAgg();
    cur.events += 1;
    if (e.event_name === "Base") {
      cur.conv += 1;
      const r = parseFloat(e.revenue);
      if (Number.isFinite(r)) cur.revenue += r;
    } else if (e.event_name === "Learn More Clicked") {
      cur.lm += 1;
    } else if (e.event_name === "CTC Clicked") {
      cur.ctc += 1;
    }
    colMap.set(ck, cur);
  }
  const rows = [];
  const grandTotal = emptyAgg();
  for (const [rk, colMap] of grid) {
    const total = emptyAgg();
    for (const v of colMap.values()) mergeAgg(total, v);
    mergeAgg(grandTotal, total);
    rows.push({ key: rk, cols: colMap, total });
  }
  return { rows, cols: Array.from(colSet), grandTotal };
}

// Sensible default drill dimension when a user picks a row to dig into.
// e.g. drill from region → city, country → region, platform → os version.
// Anything not listed falls through to "city" since geographic drill is
// the most common ask.
const DRILL_DEFAULTS = {
  region: "city",
  country: "region",
  city: "carrier",
  platform: "os_version",
  os_version: "browser",
  device_type: "brand",
  brand: "platform",
  carrier: "city",
  isp: "city",
  dma: "city",
  language: "country",
  sub1: "offer_name",
  offer_name: "sub1",
  revenue_type: "sub1",
  network_id: "sub1",
  dayOfWeek: "hour",
  hour: "dayOfWeek",
  date: "hour",
  latencyBucket: "device_type",
};

function CrosstabView({ events }) {
  const [rowDim, setRowDim] = useState("region");
  const [colDim, setColDim] = useState("device_type");
  const [metric, setMetric] = useState("revenue");
  const [rowLimit, setRowLimit] = useState(15);
  const [colLimit, setColLimit] = useState(8);
  const [filter, setFilter] = useState("");
  const [sortByCol, setSortByCol] = useState(null); // null = row total
  const [sortDir, setSortDir] = useState("desc");
  const [selectedRow, setSelectedRow] = useState(null);
  const [drillDim, setDrillDim] = useState(null); // null → fall back to DRILL_DEFAULTS[rowDim]

  // When the parent dimension changes, the previously selected row no
  // longer exists in the new dimension, so clear the drill state.
  useEffect(() => {
    setSelectedRow(null);
    setDrillDim(null);
  }, [rowDim]);

  const rDim = DIMENSIONS.find((d) => d.key === rowDim) || DIMENSIONS[0];
  const cDim = DIMENSIONS.find((d) => d.key === colDim) || DIMENSIONS[1];
  const met = METRICS.find((m) => m.key === metric) || METRICS[0];
  const effectiveDrillDim = drillDim || DRILL_DEFAULTS[rowDim] || "city";

  const grid = useMemo(
    () => buildCrosstab(events, rDim, cDim),
    [events, rDim, cDim],
  );

  // Filter rows by search.
  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return grid.rows;
    return grid.rows.filter((r) => r.key.toLowerCase().includes(q));
  }, [grid.rows, filter]);

  // Rank columns by total of the metric so we can take the top N. The
  // overflow goes into an "Other" column so the matrix doesn't lie.
  const { visibleCols, otherCols, colTotals } = useMemo(() => {
    const totals = new Map();
    for (const c of grid.cols) {
      const t = emptyAgg();
      for (const r of filteredRows) {
        const v = r.cols.get(c);
        if (v) mergeAgg(t, v);
      }
      totals.set(c, t);
    }
    const sorted = [...grid.cols].sort(
      (a, b) => metricValue(totals.get(b), metric) - metricValue(totals.get(a), metric),
    );
    if (colLimit === -1) {
      return { visibleCols: sorted, otherCols: [], colTotals: totals };
    }
    return {
      visibleCols: sorted.slice(0, colLimit),
      otherCols: sorted.slice(colLimit),
      colTotals: totals,
    };
  }, [grid.cols, filteredRows, metric, colLimit]);

  // For each row, compute the "Other" bucket per its overflowing columns.
  const rowsWithOther = useMemo(() => {
    return filteredRows.map((r) => {
      const other = emptyAgg();
      for (const c of otherCols) {
        const v = r.cols.get(c);
        if (v) mergeAgg(other, v);
      }
      return { ...r, other };
    });
  }, [filteredRows, otherCols]);

  // Sort rows.
  const sortedRows = useMemo(() => {
    return [...rowsWithOther].sort((a, b) => {
      let av;
      let bv;
      if (sortByCol === "__total__") {
        av = metricValue(a.total, metric);
        bv = metricValue(b.total, metric);
      } else if (sortByCol === "__other__") {
        av = metricValue(a.other, metric);
        bv = metricValue(b.other, metric);
      } else if (sortByCol === "__key__") {
        return sortDir === "desc"
          ? b.key.localeCompare(a.key)
          : a.key.localeCompare(b.key);
      } else if (sortByCol == null) {
        av = metricValue(a.total, metric);
        bv = metricValue(b.total, metric);
      } else {
        av = metricValue(a.cols.get(sortByCol), metric);
        bv = metricValue(b.cols.get(sortByCol), metric);
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [rowsWithOther, sortByCol, sortDir, metric]);

  const visibleRows =
    rowLimit === -1 ? sortedRows : sortedRows.slice(0, rowLimit);

  // Max cell value among visible rows × visible cols for heatmap scale.
  const maxCell = useMemo(() => {
    let m = 0;
    for (const r of visibleRows) {
      for (const c of visibleCols) {
        const v = metricValue(r.cols.get(c), metric);
        if (v > m) m = v;
      }
      if (otherCols.length > 0) {
        const v = metricValue(r.other, metric);
        if (v > m) m = v;
      }
    }
    return m;
  }, [visibleRows, visibleCols, otherCols, metric]);

  const onHeaderClick = (key) => {
    if (sortByCol === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortByCol(key);
      setSortDir("desc");
    }
  };

  const cellStyle = (value) => {
    if (maxCell <= 0 || value <= 0) return undefined;
    const intensity = Math.min(0.7, (value / maxCell) * 0.7);
    return { backgroundColor: `rgba(16, 185, 129, ${intensity})` };
  };

  const sameDim = rowDim === colDim;

  const exportCsv = () => {
    const headers = [rDim.label];
    for (const c of visibleCols) headers.push(c);
    if (otherCols.length > 0) headers.push(`Other (${otherCols.length})`);
    headers.push("Row total");
    const lines = [headers.join(",")];
    for (const r of sortedRows) {
      const cells = [csvEscape(r.key)];
      for (const c of visibleCols) {
        cells.push(metricValue(r.cols.get(c), metric).toString());
      }
      if (otherCols.length > 0) {
        cells.push(metricValue(r.other, metric).toString());
      }
      cells.push(metricValue(r.total, metric).toString());
      lines.push(cells.join(","));
    }
    // Column totals row
    const totals = ["Total"];
    for (const c of visibleCols) {
      totals.push(metricValue(colTotals.get(c), metric).toString());
    }
    if (otherCols.length > 0) {
      const t = emptyAgg();
      for (const c of otherCols) {
        const v = colTotals.get(c);
        if (v) mergeAgg(t, v);
      }
      totals.push(metricValue(t, metric).toString());
    }
    totals.push(metricValue(grid.grandTotal, metric).toString());
    lines.push(totals.join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `crosstab-${rowDim}-x-${colDim}-${metric}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const otherTotal = useMemo(() => {
    if (otherCols.length === 0) return null;
    const t = emptyAgg();
    for (const c of otherCols) {
      const v = colTotals.get(c);
      if (v) mergeAgg(t, v);
    }
    return t;
  }, [otherCols, colTotals]);

  return (
    <div className="space-y-4">
      <div className="surface px-4 py-3.5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Rows (dimension A)
            </label>
            <select
              value={rowDim}
              onChange={(e) => {
                setRowDim(e.target.value);
                setSortByCol(null);
              }}
              className="w-full rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Columns (dimension B)
            </label>
            <select
              value={colDim}
              onChange={(e) => {
                setColDim(e.target.value);
                setSortByCol(null);
              }}
              className="w-full rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Cell metric
            </label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
                Filter rows
              </label>
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-lg ring-1 ring-ink-200 bg-white pl-7 pr-3 py-1.5 text-[12.5px] text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[12px] font-semibold px-3 py-1.5 hover:bg-ink-50"
            >
              <Download size={12} />
              CSV
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap text-[11.5px]">
          <span className="text-ink-500">Show</span>
          <select
            value={rowLimit}
            onChange={(e) => setRowLimit(Number(e.target.value))}
            className="rounded ring-1 ring-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-900 outline-none"
          >
            {[10, 15, 25, 50].map((n) => (
              <option key={n} value={n}>
                Top {n} rows
              </option>
            ))}
            <option value={-1}>All ({sortedRows.length})</option>
          </select>
          <span className="text-ink-500">×</span>
          <select
            value={colLimit}
            onChange={(e) => setColLimit(Number(e.target.value))}
            className="rounded ring-1 ring-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-900 outline-none"
          >
            {[5, 8, 12, 20].map((n) => (
              <option key={n} value={n}>
                Top {n} cols
              </option>
            ))}
            <option value={-1}>All ({grid.cols.length})</option>
          </select>
          <span className="text-ink-300">·</span>
          <span className="text-ink-500">
            Grand total{" "}
            <span className="font-bold text-ink-900">
              {met.fmt(metricValue(grid.grandTotal, metric))}
            </span>
          </span>
          {sortByCol && (
            <button
              type="button"
              onClick={() => {
                setSortByCol(null);
                setSortDir("desc");
              }}
              className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 underline"
            >
              Reset sort
            </button>
          )}
        </div>
      </div>

      {sameDim && (
        <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50/60 px-4 py-2.5 text-[11.5px] text-amber-800 font-semibold">
          Row and column dimension are the same — pick two different ones to
          see a meaningful crosstab.
        </div>
      )}

      {!sameDim && visibleRows.length === 0 && (
        <div className="surface px-6 py-10 text-center text-ink-500 text-sm italic">
          No rows match your filter.
        </div>
      )}

      {!sameDim && visibleRows.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] border-collapse">
              <thead className="bg-ink-50 border-b border-ink-200">
                <tr>
                  <th className="sticky left-0 z-10 bg-ink-50 py-2 px-3 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider min-w-32 border-r border-ink-200">
                    <button
                      type="button"
                      onClick={() => onHeaderClick("__key__")}
                      className={`inline-flex items-center gap-1 ${
                        sortByCol === "__key__"
                          ? "text-ink-900"
                          : "text-ink-500 hover:text-ink-800"
                      }`}
                    >
                      {rDim.label}
                      <SortIcon
                        active={sortByCol === "__key__"}
                        dir={sortByCol === "__key__" ? sortDir : null}
                      />
                    </button>
                  </th>
                  {visibleCols.map((c) => {
                    const isActive = sortByCol === c;
                    return (
                      <th
                        key={c}
                        className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider whitespace-nowrap"
                      >
                        <button
                          type="button"
                          onClick={() => onHeaderClick(c)}
                          className={`inline-flex items-center gap-1 flex-row-reverse ${
                            isActive
                              ? "text-ink-900"
                              : "text-ink-500 hover:text-ink-800"
                          }`}
                          title={c}
                        >
                          {c.length > 16 ? c.slice(0, 14) + "…" : c}
                          <SortIcon
                            active={isActive}
                            dir={isActive ? sortDir : null}
                          />
                        </button>
                      </th>
                    );
                  })}
                  {otherCols.length > 0 && (
                    <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onHeaderClick("__other__")}
                        className={`inline-flex items-center gap-1 flex-row-reverse ${
                          sortByCol === "__other__"
                            ? "text-ink-900"
                            : "text-ink-500 hover:text-ink-800"
                        }`}
                        title={`Other ${otherCols.length} ${cDim.label.toLowerCase()} values`}
                      >
                        Other ({otherCols.length})
                        <SortIcon
                          active={sortByCol === "__other__"}
                          dir={sortByCol === "__other__" ? sortDir : null}
                        />
                      </button>
                    </th>
                  )}
                  <th className="py-2 px-2 text-right font-bold text-ink-700 text-[10.5px] uppercase analytics-wider whitespace-nowrap border-l border-ink-200 bg-ink-100">
                    <button
                      type="button"
                      onClick={() => onHeaderClick("__total__")}
                      className={`inline-flex items-center gap-1 flex-row-reverse ${
                        sortByCol === "__total__" || sortByCol == null
                          ? "text-ink-900"
                          : "text-ink-500 hover:text-ink-800"
                      }`}
                    >
                      Row total
                      <SortIcon
                        active={
                          sortByCol === "__total__" || sortByCol == null
                        }
                        dir={
                          sortByCol === "__total__" || sortByCol == null
                            ? sortDir
                            : null
                        }
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const isSelected = r.key === selectedRow;
                  return (
                  <tr
                    key={r.key}
                    className={`border-b border-ink-100 last:border-0 ${
                      isSelected ? "bg-brand-50/60" : ""
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 py-1.5 px-3 font-semibold whitespace-nowrap border-r border-ink-200 ${
                        isSelected ? "bg-brand-50" : "bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedRow(isSelected ? null : r.key)
                        }
                        title={`Drill into ${r.key}`}
                        className={`inline-flex items-center gap-1.5 group ${
                          isSelected
                            ? "text-brand-700"
                            : "text-ink-900 hover:text-brand-700"
                        }`}
                      >
                        {r.key}
                        <ChevronRightIcon
                          size={11}
                          className={`transition-transform ${
                            isSelected
                              ? "rotate-90 text-brand-600"
                              : "text-ink-300 group-hover:text-brand-500"
                          }`}
                        />
                      </button>
                    </td>
                    {visibleCols.map((c) => {
                      const v = metricValue(r.cols.get(c), metric);
                      return (
                        <td
                          key={c}
                          className="py-1.5 px-2 text-right tabular text-ink-800"
                          style={cellStyle(v)}
                        >
                          {v > 0 ? met.fmt(v) : "—"}
                        </td>
                      );
                    })}
                    {otherCols.length > 0 && (
                      <td
                        className="py-1.5 px-2 text-right tabular text-ink-600 italic"
                        style={cellStyle(metricValue(r.other, metric))}
                      >
                        {metricValue(r.other, metric) > 0
                          ? met.fmt(metricValue(r.other, metric))
                          : "—"}
                      </td>
                    )}
                    <td className="py-1.5 px-2 text-right tabular font-bold text-ink-900 border-l border-ink-200 bg-ink-50/60">
                      {met.fmt(metricValue(r.total, metric))}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-ink-100 border-t-2 border-ink-200">
                <tr>
                  <td className="sticky left-0 z-10 bg-ink-100 py-2 px-3 font-bold text-ink-700 text-[11px] uppercase analytics-wider border-r border-ink-200">
                    Col total
                  </td>
                  {visibleCols.map((c) => (
                    <td
                      key={c}
                      className="py-2 px-2 text-right tabular font-bold text-ink-900"
                    >
                      {met.fmt(metricValue(colTotals.get(c), metric))}
                    </td>
                  ))}
                  {otherCols.length > 0 && otherTotal && (
                    <td className="py-2 px-2 text-right tabular font-bold text-ink-700 italic">
                      {met.fmt(metricValue(otherTotal, metric))}
                    </td>
                  )}
                  <td className="py-2 px-2 text-right tabular font-extrabold text-emerald-700 border-l border-ink-200 bg-ink-200/60">
                    {met.fmt(metricValue(grid.grandTotal, metric))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-ink-200 bg-ink-50 text-[11px] text-ink-500">
            Showing{" "}
            <span className="font-bold text-ink-900 tabular">
              {visibleRows.length}
            </span>{" "}
            of {sortedRows.length} {rDim.label.toLowerCase()} ·{" "}
            <span className="font-bold text-ink-900 tabular">
              {visibleCols.length}
            </span>{" "}
            of {grid.cols.length} {cDim.label.toLowerCase()} · cells shaded
            relative to highest visible cell value · click a row to drill in
          </div>
        </div>
      )}

      {selectedRow && (
        <DrillPanel
          events={events}
          parentDim={rDim}
          parentValue={selectedRow}
          metric={metric}
          met={met}
          drillDim={effectiveDrillDim}
          setDrillDim={setDrillDim}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}

// Renders a focused per-row drill below the main crosstab. Filters
// `events` down to those matching the picked parent value, then runs a
// 1-D pivot by the chosen drill dimension using the same cell metric.
// Shows share within parent + cumulative %, plus a horizontal bar per row
// so the 80/20 pops visually.
function DrillPanel({
  events,
  parentDim,
  parentValue,
  metric,
  met,
  drillDim,
  setDrillDim,
  onClose,
}) {
  const dDim = DIMENSIONS.find((d) => d.key === drillDim) || DIMENSIONS[0];

  const filtered = useMemo(
    () =>
      events.filter(
        (e) => (parentDim.get(e) ?? "").toString().trim() === parentValue,
      ),
    [events, parentDim, parentValue],
  );

  const { rows, parentTotal } = useMemo(() => {
    const map = new Map();
    const total = emptyAgg();
    for (const e of filtered) {
      const k = (dDim.get(e) ?? "").toString().trim();
      if (!k) continue;
      const cur = map.get(k) || emptyAgg();
      cur.events += 1;
      if (e.event_name === "Base") {
        cur.conv += 1;
        const r = parseFloat(e.revenue);
        if (Number.isFinite(r)) cur.revenue += r;
      } else if (e.event_name === "Learn More Clicked") {
        cur.lm += 1;
      } else if (e.event_name === "CTC Clicked") {
        cur.ctc += 1;
      }
      map.set(k, cur);
    }
    const out = [];
    for (const [key, agg] of map) {
      mergeAgg(total, agg);
      out.push({ key, ...agg });
    }
    return { rows: out, parentTotal: total };
  }, [filtered, dDim]);

  const parentMetric = metricValue(parentTotal, metric);

  const decorated = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => metricValue(b, metric) - metricValue(a, metric),
    );
    let cum = 0;
    return sorted.map((r) => {
      const v = metricValue(r, metric);
      cum += v;
      return {
        ...r,
        value: v,
        share: parentMetric > 0 ? v / parentMetric : 0,
        cumShare: parentMetric > 0 ? cum / parentMetric : 0,
      };
    });
  }, [rows, metric, parentMetric]);

  const maxV = Math.max(0, ...decorated.map((r) => r.value));

  const exportCsv = () => {
    const headers = [
      dDim.label,
      "Events",
      "Conv",
      "Revenue",
      met.label,
      "Share of parent",
      "Cumulative",
    ];
    const lines = [headers.join(",")];
    for (const r of decorated) {
      lines.push(
        [
          csvEscape(r.key),
          r.events,
          r.conv,
          r.revenue,
          r.value,
          r.share,
          r.cumShare,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `drill-${parentDim.key}-${parentValue}-by-${dDim.key}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="surface px-5 py-5 ring-2 ring-brand-300">
      <div className="flex items-start gap-2.5 mb-4 flex-wrap">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Crosshair size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Drilling into{" "}
            <span className="text-brand-700">{parentValue}</span>{" "}
            <span className="font-normal text-ink-500 text-[11px]">
              ({parentDim.label})
            </span>
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            {fmtInt(filtered.length)} events under {parentValue} · grouped
            by{" "}
            <span className="font-semibold text-ink-700">
              {dDim.label.toLowerCase()}
            </span>{" "}
            · metric{" "}
            <span className="font-semibold text-ink-700">
              {met.label.toLowerCase()}
            </span>{" "}
            · parent total{" "}
            <span className="font-bold text-ink-900">
              {met.fmt(parentMetric)}
            </span>
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Break down by
            </label>
            <select
              value={drillDim}
              onChange={(e) => setDrillDim(e.target.value)}
              className="rounded-lg ring-1 ring-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              {DIMENSIONS.filter((d) => d.key !== parentDim.key).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[11.5px] font-semibold px-2.5 py-1.5 hover:bg-ink-50"
          >
            <Download size={11} />
            CSV
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drill"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-ink-200 bg-white text-ink-500 hover:bg-rose-50 hover:text-rose-700 hover:ring-rose-200"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {decorated.length === 0 ? (
        <p className="text-[12px] text-ink-500 italic">
          No {dDim.label.toLowerCase()} values recorded under {parentValue}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="py-2 px-2 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider w-10">
                  #
                </th>
                <th className="py-2 px-2 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  {dDim.label}
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  Events
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  Conv
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  Revenue
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  {met.label}
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  Share
                </th>
                <th className="py-2 px-2 text-right font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider">
                  Cum %
                </th>
                <th className="py-2 px-2 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider min-w-32">
                  Distribution
                </th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => {
                const width = maxV > 0 ? (r.value / maxV) * 100 : 0;
                return (
                  <tr
                    key={r.key}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60"
                  >
                    <td className="py-1.5 px-2 text-ink-500 tabular text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-2 font-semibold text-ink-900">
                      {r.key}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular text-ink-700">
                      {fmtInt(r.events)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular text-ink-700">
                      {fmtInt(r.conv)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular font-semibold text-ink-900">
                      {fmtMoney(r.revenue)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular font-bold text-brand-700">
                      {met.fmt(r.value)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular text-ink-700">
                      {fmtPct(r.share, 1)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular text-ink-500">
                      {fmtPct(r.cumShare, 1)}
                    </td>
                    <td className="py-1.5 px-2 min-w-32">
                      <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-ink-50 border-t border-ink-200">
              <tr>
                <td className="py-2 px-2 text-[11px] font-bold uppercase analytics-wider text-ink-500">
                  Σ
                </td>
                <td className="py-2 px-2 text-left text-[11.5px] font-bold text-ink-900">
                  {decorated.length} {dDim.label.toLowerCase()} value
                  {decorated.length === 1 ? "" : "s"}
                </td>
                <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                  {fmtInt(parentTotal.events)}
                </td>
                <td className="py-2 px-2 text-right tabular font-bold text-ink-900">
                  {fmtInt(parentTotal.conv)}
                </td>
                <td className="py-2 px-2 text-right tabular font-bold text-emerald-700">
                  {fmtMoney(parentTotal.revenue)}
                </td>
                <td className="py-2 px-2 text-right tabular font-bold text-brand-700">
                  {met.fmt(parentMetric)}
                </td>
                <td className="py-2 px-2 text-right tabular font-bold text-ink-500">
                  100%
                </td>
                <td colSpan={2} className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function csvEscape(s) {
  const str = (s ?? "").toString().replace(/"/g, '""');
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str}"`
    : str;
}

// ── Raw mode ──────────────────────────────────────────────────────────────

const RAW_COLUMNS = [
  { key: "date", label: "Date (UTC)", fmt: (v) => (v || "").slice(0, 19) },
  { key: "event_name", label: "Event" },
  { key: "revenue", label: "Revenue", num: true, fmt: (v) => fmtMoney(parseFloat(v) || 0) },
  { key: "revenue_type", label: "Type" },
  { key: "delta_hours", label: "Δh", num: true, fmt: (v) => (parseFloat(v) || 0).toFixed(2) },
  { key: "sub1", label: "Sub1" },
  { key: "offer_name", label: "Offer" },
  { key: "city", label: "City" },
  { key: "region", label: "State" },
  { key: "country", label: "Country" },
  { key: "device_type", label: "Device" },
  { key: "platform", label: "Platform" },
  { key: "os_version", label: "OS" },
  { key: "browser", label: "Browser" },
  { key: "carrier", label: "Carrier" },
];

function RawView({ events }) {
  const [eventFilter, setEventFilter] = useState("Base");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (eventFilter !== "ALL" && e.event_name !== eventFilter) return false;
      if (!q) return true;
      for (const v of Object.values(e)) {
        if (v && v.toString().toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [events, eventFilter, search]);

  const sorted = useMemo(() => {
    const col = RAW_COLUMNS.find((c) => c.key === sortBy);
    const numeric = col?.num;
    return [...filtered].sort((a, b) => {
      const av = a[sortBy] || "";
      const bv = b[sortBy] || "";
      if (numeric) {
        const an = parseFloat(av) || 0;
        const bn = parseFloat(bv) || 0;
        return sortDir === "desc" ? bn - an : an - bn;
      }
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }, [filtered, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  const toggleSort = (col) => {
    if (col === sortBy) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const exportCsv = () => {
    const headers = RAW_COLUMNS.map((c) => c.label);
    const lines = [headers.join(",")];
    for (const r of sorted) {
      const cells = RAW_COLUMNS.map((c) => {
        const v = r[c.key] ?? "";
        const s = v.toString().replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s}"`
          : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `events-${eventFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="surface px-4 py-3.5">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Event
            </label>
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg ring-1 ring-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
            >
              <option value="Base">Base (conversions)</option>
              <option value="Learn More Clicked">Learn More</option>
              <option value="CTC Clicked">CTC</option>
              <option value="ALL">All events</option>
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-[10.5px] font-bold uppercase analytics-wider text-ink-500 mb-1">
              Search
            </label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search across all fields…"
                className="w-full rounded-lg ring-1 ring-ink-200 bg-white pl-7 pr-3 py-1.5 text-[12.5px] text-ink-900 outline-none focus:ring-brand-400 focus:ring-2"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[12px] font-semibold px-3 py-1.5 hover:bg-ink-50"
          >
            <Download size={12} />
            Export {fmtInt(sorted.length)} rows
          </button>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                {RAW_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="py-2 px-2 text-left font-semibold text-ink-500 text-[10.5px] uppercase analytics-wider whitespace-nowrap select-none"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 ${
                        sortBy === c.key
                          ? "text-ink-900"
                          : "text-ink-500 hover:text-ink-800"
                      }`}
                    >
                      {c.label}
                      <SortIcon
                        active={sortBy === c.key}
                        dir={sortBy === c.key ? sortDir : null}
                      />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={RAW_COLUMNS.length}
                    className="py-6 text-center text-ink-500 italic"
                  >
                    No events match.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => (
                  <tr
                    key={r.conversion_id || idx}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60"
                  >
                    {RAW_COLUMNS.map((c) => {
                      const v = r[c.key];
                      const display = c.fmt ? c.fmt(v) : v || "—";
                      return (
                        <td
                          key={c.key}
                          className={`py-1.5 px-2 ${
                            c.num
                              ? "tabular text-right text-ink-900 font-semibold"
                              : "text-ink-700"
                          } whitespace-nowrap`}
                          title={c.fmt ? undefined : v || ""}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-ink-200 bg-ink-50 text-[11.5px]">
          <span className="text-ink-600">
            Showing{" "}
            <span className="font-bold text-ink-900 tabular">
              {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)}
            </span>{" "}
            of{" "}
            <span className="font-bold text-ink-900 tabular">
              {fmtInt(sorted.length)}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded ring-1 ring-ink-200 bg-white text-ink-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-100"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="px-2 text-ink-700 font-semibold tabular">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded ring-1 ring-ink-200 bg-white text-ink-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-100"
            >
              <ChevronRightIcon size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ insights }) {
  return (
    <div className="space-y-5 pb-10">
      <UserQualityCard insights={insights} />
      {insights.topEngagedUsers.length > 0 && (
        <TopUsersCard topEngagedUsers={insights.topEngagedUsers} />
      )}
    </div>
  );
}

function GeographyTab({ insights }) {
  return (
    <div className="space-y-4 pb-10">
      <div className="grid gap-4 md:grid-cols-2">
        <RankedListCard
          icon={MapPin}
          title="Top states"
          sub="Where the volume + revenue are concentrating."
          rows={insights.byState}
          totalConversions={insights.conversions}
          showRevenue
          showUsers
          emptyText="No state-level data yet."
        />
        <RankedListCard
          icon={Building2}
          title="Top cities"
          sub="City-level cuts often expose the actual ad creative + offer fit."
          rows={insights.byCity}
          totalConversions={insights.conversions}
          showRevenue
          showUsers
          emptyText="No city data yet."
        />
        {insights.byDma.length > 0 && (
          <RankedListCard
            icon={MapPin}
            title="DMA"
            sub="Designated Market Area — finer than state, coarser than city."
            rows={insights.byDma}
            totalConversions={insights.conversions}
            showRevenue
            showUsers
            emptyText=""
          />
        )}
      </div>
    </div>
  );
}

function DeviceTab({ insights }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 pb-10">
      <RankedListCard
        icon={Smartphone}
        title="Device type"
        sub="Mobile vs Tablet vs PC."
        rows={insights.byDeviceType}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="No device data yet."
      />
      <RankedListCard
        icon={Globe2}
        title="Platform (OS)"
        sub="Android / iOS / Windows — maps to creative format fit."
        rows={insights.byPlatform}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="No platform data yet."
      />
      <RankedListCard
        icon={Layers}
        title="OS version"
        sub="Old OS versions usually mean cheaper but lower-intent traffic."
        rows={insights.byOsVersion}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="No OS version data yet."
      />
      <RankedListCard
        icon={FileText}
        title="Browser / source"
        sub="Facebook in-app, Chrome, Safari, Edge, etc."
        rows={insights.byBrowser}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="No browser data yet."
      />
      <RankedListCard
        icon={Signal}
        title="Carrier"
        sub="T-Mobile, Verizon, AT&T — useful for cohort analysis."
        rows={insights.byCarrier}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="Carrier data isn't present in this campaign."
      />
      <RankedListCard
        icon={Network}
        title="ISP"
        sub="Network provider, often correlates with quality."
        rows={insights.byIsp}
        totalConversions={insights.conversions}
        showRevenue
        showUsers
        emptyText="No ISP data yet."
      />
      {insights.byOffer.length > 0 && (
        <RankedListCard
          icon={Award}
          title="Sub1 / offer code"
          sub="Which offer ID is converting — useful for split-testing."
          rows={insights.byOffer}
          totalConversions={insights.conversions}
          showRevenue
          showUsers
          emptyText=""
        />
      )}
    </div>
  );
}

function QualityTab({ insights }) {
  return (
    <div className="space-y-5 pb-10">
      <div className="grid gap-4 md:grid-cols-2">
        <LatencyCard insights={insights} />
        <QualitySignalsCard insights={insights} />
      </div>
      {insights.topConversions.length > 0 && (
        <TopConversionsCard topConversions={insights.topConversions} />
      )}
    </div>
  );
}

function UploadsTab({ uploads, campaign, onChanged }) {
  return (
    <div className="space-y-5 pb-10">
      <UploadsManager
        uploads={uploads}
        campaignId={campaign.id}
        onChanged={onChanged}
      />
      <DangerZone campaignId={campaign.id} campaignName={campaign.name} />
    </div>
  );
}

// ── Match Meta tab ─────────────────────────────────────────────────────────
// Pairs the analytics dataset with a Meta Ads campaign so we can compute the
// numbers Meta on its own can't show: true ROAS, real CPA, and the
// click-attribution gap between Meta's reported link-clicks and the
// Learn-More events that actually landed in the tracker.

function MatchMetaTab({ campaign, onChanged }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/analytics/campaigns/${campaign.id}/match`);
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error(
          `Server returned ${r.status} but the body wasn't JSON. The /match route probably hasn't compiled yet — restart \`npm run dev\` to pick it up. Body: ${text.slice(0, 200)}`,
        );
      }
      if (!r.ok && !("linked" in j)) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setMatch(j);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const unlinkAll = async () => {
    await fetch(`/api/analytics/campaigns/${campaign.id}/link`, {
      method: "DELETE",
    });
    setEditing(false);
    await load();
    onChanged?.();
  };

  const removeLink = async (campaignIdToRemove) => {
    const remaining = (match.links || []).filter(
      (l) => l.campaignId !== campaignIdToRemove,
    );
    if (remaining.length === 0) {
      await unlinkAll();
      return;
    }
    await fetch(`/api/analytics/campaigns/${campaign.id}/link`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: remaining }),
    });
    await load();
    onChanged?.();
  };

  if (loading && !match) {
    return (
      <div className="surface px-6 py-10 text-center text-ink-500 text-sm">
        Loading match…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="surface px-6 py-8">
        <p className="text-sm font-bold text-rose-700 text-center">
          Couldn't load match data
        </p>
        <p className="text-[12px] text-ink-600 mt-2 leading-relaxed max-w-2xl mx-auto">
          {loadError}
        </p>
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[12px] font-semibold px-3 py-1.5 hover:bg-ink-50"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!match) {
    return (
      <div className="surface px-6 py-10 text-center text-rose-700 text-sm">
        Couldn't load match data.
      </div>
    );
  }

  if (!match.linked || editing) {
    return (
      <MetaCampaignPicker
        campaign={campaign}
        existingLinks={match.links || []}
        onSaved={async () => {
          setEditing(false);
          await load();
          onChanged?.();
        }}
        onCancel={match.linked ? () => setEditing(false) : null}
      />
    );
  }

  const nonUsdLinks =
    match.perCampaign?.filter((p) => p.currency?.needsConversion) || [];

  return (
    <div className="space-y-5 pb-10">
      <LinkedHeader
        links={match.links}
        range={match.range}
        onChange={() => setEditing(true)}
        onUnlinkAll={unlinkAll}
        onRemove={removeLink}
      />
      {match.metaError && (
        <div className="surface px-5 py-5">
          <p className="text-sm font-bold text-rose-700">
            Couldn't fetch the Meta side
          </p>
          <p className="text-[12px] text-ink-500 mt-1">{match.metaError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"
          >
            <RefreshCw size={11} />
            Retry
          </button>
        </div>
      )}
      {match.errors?.length > 0 && (
        <PerLinkErrorsCard errors={match.errors} />
      )}
      {!match.metaError && match.combined && (
        <>
          {nonUsdLinks.length > 0 && (
            <CurrencyBanners
              perCampaign={nonUsdLinks}
              campaignId={campaign.id}
              allLinks={match.links}
              onSaved={load}
            />
          )}
          <PairedKpiGrid
            combined={match.combined}
            analytics={match.analytics}
            linkCount={match.links.length}
          />
          <DerivedMetricsCard
            derived={match.derived}
            combined={match.combined}
            analytics={match.analytics}
          />
          {match.perCampaign.length > 1 && (
            <PerCampaignBreakdown perCampaign={match.perCampaign} />
          )}
          <MatchVerdictsCard match={match} />
          <MatchDailyOverlay daily={match.daily} />
        </>
      )}
    </div>
  );
}

function PerLinkErrorsCard({ errors }) {
  return (
    <div className="rounded-xl ring-1 ring-rose-200 bg-rose-50/60 px-4 py-3">
      <p className="text-[12.5px] font-bold text-rose-800 mb-1">
        Some linked campaigns couldn't be fetched
      </p>
      <ul className="text-[11.5px] text-rose-700 space-y-0.5">
        {errors.map((e) => (
          <li key={e.campaignId}>
            <span className="font-semibold">{e.name}</span> ({e.campaignId}):{" "}
            {e.error}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkedHeader({ links, range, onChange, onUnlinkAll, onRemove }) {
  const single = links.length === 1;
  return (
    <div className="surface px-5 py-4">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Link2 size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase analytics-wider text-ink-500">
            Matched against {links.length}{" "}
            {single ? "Meta campaign" : "Meta campaigns"}
          </p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            Window{" "}
            <span className="font-semibold text-ink-700">
              {range.since} → {range.until}
            </span>{" "}
            (from the analytics dataset's first → last event)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChange}
            className="inline-flex items-center gap-1 rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[11.5px] font-semibold px-2.5 py-1.5 hover:bg-ink-50"
          >
            <RefreshCw size={11} />
            Change
          </button>
          <button
            type="button"
            onClick={onUnlinkAll}
            className="inline-flex items-center gap-1 rounded-lg ring-1 ring-rose-200 bg-white text-rose-700 text-[11.5px] font-semibold px-2.5 py-1.5 hover:bg-rose-50"
          >
            <Unlink size={11} />
            Unlink all
          </button>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li
            key={l.campaignId}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 ring-1 ring-brand-200 pl-2.5 pr-1 py-1 max-w-full"
          >
            <span className="text-[11.5px] font-semibold text-brand-800 truncate max-w-[28ch]">
              {l.name}
            </span>
            <span className="text-[10px] font-mono text-brand-600 hidden md:inline">
              {l.campaignId}
            </span>
            {l.currency && l.currency !== "USD" && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1">
                {l.currency}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(l.campaignId)}
              aria-label={`Remove ${l.name}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 hover:text-rose-700"
            >
              <Unlink size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MAX_LINKS = 3;

function MetaCampaignPicker({ campaign, existingLinks = [], onSaved, onCancel }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(
    existingLinks[0]?.accountId || "",
  );
  const [campaignsByAccount, setCampaignsByAccount] = useState({});
  // selected: array of { accountId, campaignId, name, objective, currency }
  const [selected, setSelected] = useState(() =>
    existingLinks.map((l) => ({
      accountId: l.accountId,
      campaignId: l.campaignId,
      name: l.name,
      objective: l.objective || null,
      currency: l.currency || null,
    })),
  );
  const [loadingAccts, setLoadingAccts] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/meta/accounts")
      .then((r) => r.json())
      .then((j) => {
        const list = j.accounts || [];
        setAccounts(list);
        if (!accountId && list.length) setAccountId(list[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingAccts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;
    if (campaignsByAccount[accountId]) return;
    setLoadingCampaigns(true);
    fetch(
      `/api/meta/campaigns?account=${encodeURIComponent(accountId)}&range=maximum`,
    )
      .then((r) => r.json())
      .then((j) => {
        const list = (j.campaigns || []).slice().sort((a, b) =>
          (b.created_time || "").localeCompare(a.created_time || ""),
        );
        setCampaignsByAccount((prev) => ({ ...prev, [accountId]: list }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingCampaigns(false));
  }, [accountId, campaignsByAccount]);

  const currentList = campaignsByAccount[accountId] || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentList;
    return currentList.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q),
    );
  }, [currentList, search]);

  const isSelected = (campaignId) =>
    selected.some((s) => s.campaignId === campaignId);

  const toggle = (c) => {
    const acct = accounts.find((a) => a.id === accountId);
    if (isSelected(c.id)) {
      setSelected((prev) => prev.filter((s) => s.campaignId !== c.id));
      return;
    }
    if (selected.length >= MAX_LINKS) {
      setError(`Maximum ${MAX_LINKS} campaigns at a time`);
      return;
    }
    setError(null);
    setSelected((prev) => [
      ...prev,
      {
        accountId,
        campaignId: c.id,
        name: c.name || c.id,
        objective: c.objective || null,
        currency: acct?.currency || null,
      },
    ]);
  };

  const removeFromSelection = (campaignId) => {
    setSelected((prev) => prev.filter((s) => s.campaignId !== campaignId));
  };

  const save = async () => {
    if (selected.length === 0) {
      setError("Pick at least one campaign");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/analytics/campaigns/${campaign.id}/link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: selected }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to link");
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-4 flex-wrap">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Link2 size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Pick up to {MAX_LINKS} Meta campaigns to evaluate against
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed max-w-xl">
            We'll fetch each campaign's spend / impressions / clicks for the
            analytics window, sum them in USD, and compare against your CSV
            outcomes. Switch accounts to pick from a different ad account —
            your current selection persists.
          </p>
        </div>
        <span className="text-[11.5px] font-bold text-ink-700 bg-ink-100 rounded-full px-2.5 py-1">
          {selected.length} / {MAX_LINKS} selected
        </span>
      </div>

      {selected.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {selected.map((s) => (
            <li
              key={s.campaignId}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 ring-1 ring-brand-200 pl-2.5 pr-1 py-1"
            >
              <span className="text-[11.5px] font-semibold text-brand-800 truncate max-w-[24ch]">
                {s.name}
              </span>
              {s.currency && s.currency !== "USD" && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1">
                  {s.currency}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeFromSelection(s.campaignId)}
                aria-label={`Remove ${s.name}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 hover:text-rose-700"
              >
                <Unlink size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div>
          <label className="text-[11px] font-semibold uppercase analytics-wider text-ink-500 block mb-1">
            Account
          </label>
          {loadingAccts ? (
            <div className="text-[12px] text-ink-500 px-3 py-2">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="text-[12px] text-rose-700 px-3 py-2">
              No ad accounts configured
            </div>
          ) : (
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setSearch("");
              }}
              className="w-full rounded-lg ring-1 ring-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:ring-2 focus:ring-brand-400 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency || "USD"})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase analytics-wider text-ink-500 block mb-1">
            Campaign
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full rounded-lg ring-1 ring-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:ring-2 focus:ring-brand-400 outline-none mb-2"
          />
          {loadingCampaigns && !currentList.length ? (
            <div className="text-[12px] text-ink-500 px-3 py-2">
              Loading campaigns…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-[12px] text-ink-500 px-3 py-2">
              No campaigns match.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto ring-1 ring-ink-200 rounded-lg divide-y divide-ink-100 bg-white">
              {filtered.slice(0, 100).map((c) => {
                const sel = isSelected(c.id);
                const atCap = !sel && selected.length >= MAX_LINKS;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      disabled={atCap}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                        sel
                          ? "bg-brand-50"
                          : atCap
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-ink-50"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded ring-1 inline-flex items-center justify-center ${
                          sel
                            ? "bg-brand-600 ring-brand-600 text-white"
                            : "bg-white ring-ink-300"
                        }`}
                      >
                        {sel && <CheckCircle2 size={10} />}
                      </span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          c.effective_status === "ACTIVE"
                            ? "bg-emerald-500"
                            : "bg-ink-300"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[12.5px] font-semibold text-ink-900 truncate"
                          title={c.name}
                        >
                          {c.name}
                        </p>
                        <p className="text-[10.5px] text-ink-500 truncate">
                          {c.objective || "—"} · {c.id}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-rose-700 mt-3 font-semibold">{error}</p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-[12px] font-semibold px-3 py-1.5 hover:bg-ink-50"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={selected.length === 0 || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
          {busy
            ? "Saving…"
            : `Save ${selected.length} link${selected.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

// Display a number with a thousands separator and 2 decimal places. Used
// when echoing the Meta-side amount in its original currency.
function fmtAmount(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currencySymbol(code) {
  switch ((code || "").toUpperCase()) {
    case "USD":
      return "$";
    case "INR":
      return "₹";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "AUD":
      return "A$";
    case "CAD":
      return "C$";
    default:
      return code ? `${code} ` : "";
  }
}

// Shows one editable rate row per non-USD linked campaign. Persisting a
// rate calls the link PUT with the full set of links so other campaigns'
// rates aren't lost.
function CurrencyBanners({ perCampaign, campaignId, allLinks, onSaved }) {
  return (
    <div className="rounded-xl ring-1 ring-amber-200 bg-amber-50/70 px-4 py-3.5">
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <DollarSign size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold text-ink-900 leading-tight">
            Currency conversion for {perCampaign.length}{" "}
            {perCampaign.length === 1 ? "linked campaign" : "linked campaigns"}
          </p>
          <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
            Analytics revenue is in USD. Each non-USD account's spend / CPC /
            CPM is divided by its own rate before ROAS, CPA, and CPL are
            computed. Save a rate to override the default.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {perCampaign.map((p) => (
          <CurrencyRow
            key={p.link.campaignId}
            link={p.link}
            currency={p.currency}
            campaignId={campaignId}
            allLinks={allLinks}
            onSaved={onSaved}
          />
        ))}
      </ul>
    </div>
  );
}

function CurrencyRow({ link, currency, campaignId, allLinks, onSaved }) {
  const [rate, setRate] = useState(link.usdRate || currency.usdRate || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sym = currencySymbol(currency.currency);

  useEffect(() => {
    setRate(link.usdRate || currency.usdRate || "");
  }, [link.usdRate, currency.usdRate]);

  const save = async () => {
    const n = parseFloat(rate);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Re-send the full set of links, with the rate updated for this one.
      const nextLinks = allLinks.map((l) =>
        l.campaignId === link.campaignId
          ? { ...l, currency: currency.currency, usdRate: n }
          : l,
      );
      const r = await fetch(`/api/analytics/campaigns/${campaignId}/link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: nextLinks }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't save");
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 flex-wrap rounded-lg bg-white ring-1 ring-amber-200 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p
          className="text-[12.5px] font-bold text-ink-900 truncate"
          title={link.name}
        >
          {link.name}
        </p>
        <p className="text-[11px] text-ink-500 mt-0.5">
          Account currency{" "}
          <span className="font-semibold text-ink-700">
            {currency.currency}
          </span>
          {currency.isDefaultRate && (
            <span className="text-amber-700 font-semibold">
              {" "}
              · using default rate
            </span>
          )}
        </p>
      </div>
      <div className="inline-flex items-center rounded-lg ring-1 ring-amber-300 bg-amber-50 overflow-hidden">
        <span className="px-2 text-[11.5px] font-semibold text-ink-700 border-r border-amber-200">
          {sym}
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="w-24 px-2 py-1.5 text-sm bg-white text-ink-900 tabular outline-none"
          placeholder="83"
        />
        <span className="px-2 text-[11px] text-ink-500 border-l border-amber-200 bg-white">
          / $
        </span>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 text-white text-[12px] font-bold px-2.5 py-1.5 hover:bg-amber-700 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <CheckCircle2 size={11} />
        )}
        Save
      </button>
      {error && (
        <p className="basis-full text-[11.5px] text-rose-700 mt-1 font-semibold">
          {error}
        </p>
      )}
    </li>
  );
}

function PairedKpiGrid({ combined, analytics, linkCount }) {
  const metaCells = [
    { label: "Spend (USD)", value: fmtMoney(combined.spend) },
    { label: "Impressions", value: fmtInt(combined.impressions) },
    {
      label: "Link clicks",
      value: fmtInt(combined.linkClicks || combined.clicks),
      sub: combined.linkClicks
        ? `${fmtInt(combined.clicks)} total clicks`
        : "(all clicks)",
    },
    { label: "Reach", value: fmtInt(combined.reach) },
    {
      label: "CTR",
      value: combined.ctr ? `${combined.ctr.toFixed(2)}%` : "—",
      sub: combined.cpc ? `${fmtMoney(combined.cpc)} blended CPC` : null,
    },
    {
      label: "CPM",
      value: combined.cpm ? fmtMoney(combined.cpm) : "—",
      sub: null,
    },
  ];
  const trkCells = [
    { label: "Analytics events", value: fmtInt(analytics.totalEvents) },
    { label: "Learn More clicks", value: fmtInt(analytics.learnMoreCount) },
    { label: "CTC clicks", value: fmtInt(analytics.ctcCount) },
    { label: "Unique users", value: fmtInt(analytics.uniqueUsers) },
    { label: "Conversions", value: fmtInt(analytics.conversions) },
    {
      label: "Revenue",
      value: fmtMoney(analytics.revenue),
      sub: analytics.avgRevenuePerConversion
        ? `${fmtMoney(analytics.avgRevenuePerConversion)} avg`
        : null,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SideCard
        title="Meta Ads (combined)"
        accent="bg-brand-50 text-brand-700"
        sub={
          linkCount === 1
            ? "Single linked campaign"
            : `Summed across ${linkCount} linked campaigns, all in USD`
        }
        cells={metaCells}
      />
      <SideCard
        title="Analytics"
        accent="bg-emerald-50 text-emerald-700"
        sub="What actually landed in your CSV"
        cells={trkCells}
      />
    </div>
  );
}

function SideCard({ title, accent, sub, cells }) {
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold text-ink-900 leading-tight">
            {title}
          </p>
          <p className="text-[11px] text-ink-500 mt-0.5">{sub}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg px-3 py-2 ${accent.replace("text-", "bg-")} bg-opacity-30`}
          >
            <dt className="text-[10.5px] font-bold uppercase analytics-wider text-ink-500">
              {c.label}
            </dt>
            <dd className="text-[15px] font-bold text-ink-900 tabular leading-tight mt-0.5">
              {c.value}
            </dd>
            {c.sub && (
              <p className="text-[10.5px] text-ink-500 mt-0.5">{c.sub}</p>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

function DerivedMetricsCard({ derived, combined, analytics }) {
  const cells = [
    {
      label: "True ROAS",
      value:
        derived.trueROAS != null ? `×${derived.trueROAS.toFixed(2)}` : "—",
      sub:
        derived.trueROAS != null
          ? `${fmtMoney(analytics.revenue)} ÷ ${fmtMoney(combined.spend)}`
          : "Need spend + revenue to compute",
      tone:
        derived.trueROAS == null
          ? "neutral"
          : derived.trueROAS >= 2
            ? "good"
            : derived.trueROAS >= 1
              ? "warn"
              : "risk",
    },
    {
      label: "Real CPA",
      value: derived.realCPA != null ? fmtMoney(derived.realCPA) : "—",
      sub:
        combined.metaReportedCPA != null
          ? `Meta reported ${fmtMoney(combined.metaReportedCPA)}`
          : "Meta hasn't reported a CPA for this window",
      tone:
        derived.realCPA == null
          ? "neutral"
          : combined.metaReportedCPA != null &&
              derived.realCPA > combined.metaReportedCPA * 1.5
            ? "warn"
            : "neutral",
    },
    {
      label: "Real CPL",
      value: derived.realCPL != null ? fmtMoney(derived.realCPL) : "—",
      sub: `${fmtMoney(combined.spend)} ÷ ${fmtInt(analytics.learnMoreCount)} Learn-More clicks`,
      tone: "neutral",
    },
    {
      label: "Click attribution gap",
      value:
        derived.clickGapPct != null
          ? `${(derived.clickGapPct * 100).toFixed(1)}%`
          : "—",
      sub:
        derived.clickGapAbs != null
          ? `${fmtInt(Math.abs(derived.clickGapAbs))} ${derived.clickGapAbs >= 0 ? "Meta-clicks didn't reach tracker" : "extra tracked over Meta-reported"}`
          : null,
      tone:
        derived.clickGapPct == null
          ? "neutral"
          : derived.clickGapPct > 0.4
            ? "risk"
            : derived.clickGapPct > 0.2
              ? "warn"
              : "good",
    },
  ];

  const TONE = {
    good: "ring-emerald-200 bg-emerald-50/60",
    warn: "ring-amber-200 bg-amber-50/60",
    risk: "ring-rose-200 bg-rose-50/60",
    neutral: "ring-ink-200 bg-white",
  };
  const VAL = {
    good: "text-emerald-700",
    warn: "text-amber-700",
    risk: "text-rose-700",
    neutral: "text-ink-900",
  };

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-4">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-amber-300">
          <Lightbulb size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Derived metrics
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            What Meta on its own can't show you. Computed from Meta spend ×
            analytics outcomes.
          </p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-4">
        {cells.map((c) => (
          <li
            key={c.label}
            className={`rounded-lg ring-1 ${TONE[c.tone]} px-3.5 py-3`}
          >
            <p className="text-[10.5px] font-bold uppercase analytics-wider text-ink-500">
              {c.label}
            </p>
            <p
              className={`text-2xl font-bold tabular leading-tight mt-0.5 ${VAL[c.tone]}`}
            >
              {c.value}
            </p>
            {c.sub && (
              <p className="text-[10.5px] text-ink-500 mt-1 leading-snug">
                {c.sub}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchVerdictsCard({ match }) {
  const v = computeMatchVerdicts(match);
  if (v.length === 0) return null;
  return <VerdictsCard verdicts={v} />;
}

function computeMatchVerdicts(match) {
  const out = [];
  const { combined, analytics, derived, perCampaign } = match;

  // True ROAS verdict on the combined picture.
  if (derived.trueROAS != null && combined.spend > 0) {
    if (derived.trueROAS >= 3) {
      out.push({
        id: "roas",
        tone: "good",
        icon: Rocket,
        title: `Combined ROAS ${derived.trueROAS.toFixed(2)}× — strong`,
        body: `${fmtMoney(analytics.revenue)} of tracked revenue on ${fmtMoney(combined.spend)} of Meta spend across ${perCampaign.length} ${perCampaign.length === 1 ? "campaign" : "campaigns"}.`,
        action: "Scale spend on the leaders. Watch frequency for fatigue.",
      });
    } else if (derived.trueROAS >= 1) {
      out.push({
        id: "roas",
        tone: "warn",
        icon: TrendingUp,
        title: `Combined ROAS ${derived.trueROAS.toFixed(2)}× — breakeven-ish`,
        body: `${fmtMoney(analytics.revenue)} on ${fmtMoney(combined.spend)} spent. Profitable on paper, fragile in practice.`,
        action: "Squeeze CR before adding budget. Trim the weakest linked campaign first.",
      });
    } else {
      out.push({
        id: "roas",
        tone: "risk",
        icon: ShieldAlert,
        title: `Combined ROAS ${derived.trueROAS.toFixed(2)}× — losing money`,
        body: `${fmtMoney(analytics.revenue)} of revenue against ${fmtMoney(combined.spend)} of spend.`,
        action: "Pause or rework. Don't push budget into a leaking set.",
      });
    }
  }

  // Best/worst performer when multiple campaigns are linked.
  if (perCampaign.length > 1) {
    const ranked = perCampaign
      .filter((p) => p.meta.spend > 0 && p.derived?.trueROAS != null)
      .sort((a, b) => (b.derived.trueROAS || 0) - (a.derived.trueROAS || 0));
    if (ranked.length >= 2) {
      const top = ranked[0];
      const bot = ranked[ranked.length - 1];
      const gap = (top.derived.trueROAS || 0) - (bot.derived.trueROAS || 0);
      if (gap > 0.5) {
        out.push({
          id: "ranker",
          tone: "info",
          icon: Award,
          title: "Big spread between linked campaigns",
          body: `${top.link.name} pulls ${top.derived.trueROAS.toFixed(2)}× ROAS at ${fmtMoney(top.meta.spend)} spend; ${bot.link.name} only ${bot.derived.trueROAS.toFixed(2)}× at ${fmtMoney(bot.meta.spend)}.`,
          action: "Shift budget from the bottom into the top, or pause the laggard until you've fixed its targeting / creative.",
        });
      }
    }
  }

  // Click gap verdict (combined).
  if (derived.clickGapPct != null && combined.linkClicks > 100) {
    if (derived.clickGapPct > 0.4) {
      out.push({
        id: "gap",
        tone: "risk",
        icon: ShieldAlert,
        title: "Big click attribution gap",
        body: `${(derived.clickGapPct * 100).toFixed(1)}% of Meta's reported clicks (${fmtInt(combined.linkClicks)}) didn't reach the tracker. Either the redirect chain is dropping users or Meta is inflating clicks.`,
        action: "Audit the redirect path + check that the analytics pixel fires on page load.",
      });
    } else if (derived.clickGapPct < -0.1) {
      out.push({
        id: "gap",
        tone: "info",
        icon: Info,
        title: "Tracker sees more clicks than Meta",
        body: `${fmtInt(Math.abs(derived.clickGapAbs))} extra Learn-More clicks beyond Meta's report. Likely organic / direct traffic mixed in.`,
        action: "Check sub2 or referer field to confirm. If organic, isolate it before judging the Meta side.",
      });
    } else if (derived.clickGapPct > 0 && derived.clickGapPct <= 0.2) {
      out.push({
        id: "gap",
        tone: "good",
        icon: Award,
        title: "Click attribution is tight",
        body: `Only ${(derived.clickGapPct * 100).toFixed(1)}% of Meta clicks went missing — within healthy tolerance for redirect drop-off.`,
        action: "Analytics setup is solid. No action needed.",
      });
    }
  }

  // CPA reality check vs Meta-reported (combined).
  if (
    derived.realCPA != null &&
    combined.metaReportedCPA != null &&
    derived.realCPA > combined.metaReportedCPA * 1.5
  ) {
    out.push({
      id: "cpa",
      tone: "warn",
      icon: AlertTriangle,
      title: "Real CPA is much higher than Meta's report",
      body: `Tracker says ${fmtMoney(derived.realCPA)} per conversion; Meta reported ${fmtMoney(combined.metaReportedCPA)}. Meta is counting events that don't become real conversions.`,
      action: "Switch the optimization event in Meta from the upstream signal to the actual conversion event.",
    });
  }

  return out;
}

// Per-campaign breakdown: one row per linked Meta campaign so the user can
// see which campaign is pulling weight. Analytics outcomes (conversions /
// revenue) are spend-weighted attribution — it's a heuristic, not real
// per-campaign analytics, so we flag it clearly.
function PerCampaignBreakdown({ perCampaign }) {
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Award size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Per-campaign breakdown
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Each linked Meta campaign side-by-side. Conversions and revenue
            are spend-weighted across the set (we can't split analytics
            outcomes by which Meta campaign drove them).
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100">
              <th className="py-2 font-semibold">Campaign</th>
              <th className="py-2 font-semibold text-right">Spend (USD)</th>
              <th className="py-2 font-semibold text-right">Native</th>
              <th className="py-2 font-semibold text-right">Share</th>
              <th className="py-2 font-semibold text-right">Link clicks</th>
              <th className="py-2 font-semibold text-right">Conv (attr.)</th>
              <th className="py-2 font-semibold text-right">ROAS</th>
              <th className="py-2 font-semibold text-right">Real CPA</th>
            </tr>
          </thead>
          <tbody>
            {perCampaign.map((p) => {
              const sym = currencySymbol(p.currency.currency);
              const roas = p.derived?.trueROAS;
              const tone =
                roas == null
                  ? "text-ink-700"
                  : roas >= 2
                    ? "text-emerald-700"
                    : roas >= 1
                      ? "text-amber-700"
                      : "text-rose-700";
              return (
                <tr
                  key={p.link.campaignId}
                  className="border-b border-ink-100 last:border-0"
                >
                  <td className="py-2 min-w-0">
                    <p
                      className="font-semibold text-ink-900 truncate max-w-[28ch]"
                      title={p.link.name}
                    >
                      {p.link.name}
                    </p>
                    <p className="text-[10.5px] text-ink-500 font-mono truncate">
                      {p.link.campaignId}
                    </p>
                  </td>
                  <td className="py-2 text-right tabular font-bold text-ink-900">
                    {fmtMoney(p.meta.spend)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-600">
                    {p.currency.needsConversion
                      ? `${sym}${fmtAmount(p.meta.original.spend)}`
                      : "—"}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {p.derived?.spendShare != null
                      ? `${(p.derived.spendShare * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {fmtInt(p.meta.linkClicks)}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {p.derived?.attributedConversions != null
                      ? p.derived.attributedConversions.toFixed(1)
                      : "—"}
                  </td>
                  <td
                    className={`py-2 text-right tabular font-bold ${tone}`}
                  >
                    {roas != null ? `×${roas.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 text-right tabular text-ink-700">
                    {p.derived?.realCPA != null
                      ? fmtMoney(p.derived.realCPA)
                      : "—"}
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

function MatchDailyOverlay({ daily }) {
  const data = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date.slice(5),
        spend: Math.round(d.spend * 100) / 100,
        metaClicks: d.metaLinkClicks || d.metaClicks,
        learnMore: d.learnMore,
        conversions: d.conversions,
        revenue: Math.round(d.revenue * 100) / 100,
      })),
    [daily],
  );

  if (data.length === 0) {
    return (
      <div className="surface px-5 py-5">
        <p className="text-[12px] text-ink-500 italic">
          No daily data overlap to chart.
        </p>
      </div>
    );
  }

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Activity size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Daily overlay
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Meta's daily link-clicks (bar) vs the tracker's Learn-More clicks
            and Base conversions (lines). When the bar tower far overshoots
            the lines, something is dropping users.
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            content={
              <MinimalTooltip
                formatter={(v, name) =>
                  name === "spend" || name === "revenue"
                    ? fmtMoney(v)
                    : fmtInt(v)
                }
              />
            }
          />
          <Bar
            dataKey="metaClicks"
            fill="#1877f2"
            radius={[3, 3, 0, 0]}
            name="Meta clicks"
          />
          <Bar
            dataKey="learnMore"
            fill="#8b5cf6"
            radius={[3, 3, 0, 0]}
            name="Learn More"
          />
          <Bar
            dataKey="conversions"
            fill="#10b981"
            radius={[3, 3, 0, 0]}
            name="Conversions"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="surface px-6 py-12 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4">
        <Upload size={22} />
      </span>
      <p className="text-base font-bold text-ink-900">Nothing here yet</p>
      <p className="text-[13px] text-ink-600 mt-1.5 max-w-md mx-auto leading-relaxed">
        Drop your conversion-analytics CSV above. We'll dedupe by{" "}
        <code className="text-[12px] font-mono bg-ink-100 px-1.5 py-0.5 rounded">
          conversion_id
        </code>{" "}
        and pull out funnel rates, unique users, latency, device cuts, fraud
        signals, and a lot more.
      </p>
    </div>
  );
}

// ── Upload control ─────────────────────────────────────────────────────────

function fmtBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UploadButton({ campaignId, onUploaded }) {
  const inputRef = useRef(null);
  const xhrRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | uploading | processing | done | error
  const [progress, setProgress] = useState(0); // 0..1 of bytes uploaded
  const [fileMeta, setFileMeta] = useState(null); // { name, size }
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Uses XMLHttpRequest because fetch() doesn't expose upload progress
  // events. The phase flips from "uploading" → "processing" once the body
  // has been delivered and the server is parsing + appending.
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setFileMeta({ name: file.name, size: file.size });
    setResult(null);
    setError(null);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/api/analytics/campaigns/${campaignId}/upload`);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        setProgress(ev.loaded / ev.total);
        if (ev.loaded === ev.total) setPhase("processing");
      }
    });
    xhr.upload.addEventListener("load", () => setPhase("processing"));
    xhr.addEventListener("error", () => {
      setPhase("error");
      setError("Network error during upload");
    });
    xhr.addEventListener("abort", () => {
      setPhase("idle");
    });
    xhr.addEventListener("load", () => {
      const j = xhr.response;
      if (j && j.success) {
        setResult(j);
        setPhase("done");
        onUploaded?.();
      } else {
        setError(j?.error || `Upload failed (HTTP ${xhr.status})`);
        setPhase("error");
      }
    });

    const fd = new FormData();
    fd.append("csv", file);
    xhr.send(fd);

    e.target.value = "";
  };

  const cancel = () => {
    xhrRef.current?.abort();
  };

  const busy = phase === "uploading" || phase === "processing";
  const pct = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-end gap-2 min-w-64">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleChange}
      />
      {!busy ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold px-4 py-2 hover:bg-emerald-700 transition-colors"
        >
          <Upload size={14} />
          Upload CSV
        </button>
      ) : (
        <div className="w-full">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5 text-[12px] text-ink-700 min-w-0">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate font-semibold" title={fileMeta?.name}>
                {fileMeta?.name}
              </span>
            </div>
            <button
              type="button"
              onClick={cancel}
              className="text-[11px] font-semibold text-ink-500 hover:text-rose-700"
            >
              Cancel
            </button>
          </div>
          <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                phase === "processing"
                  ? "bg-emerald-500 animate-pulse w-full"
                  : "bg-emerald-500"
              }`}
              style={
                phase === "uploading" ? { width: `${pct}%` } : undefined
              }
            />
          </div>
          <p className="text-[10.5px] text-ink-500 mt-1 tabular text-right">
            {phase === "uploading"
              ? `Uploading… ${pct}%${
                  fileMeta?.size
                    ? ` (${fmtBytes(fileMeta.size * progress)} / ${fmtBytes(fileMeta.size)})`
                    : ""
                }`
              : "Processing on the server — parsing + dedupe…"}
          </p>
        </div>
      )}
      {result && phase === "done" && (
        <p className="text-[11.5px] text-emerald-700 font-semibold flex items-center gap-1">
          <CheckCircle2 size={12} />
          {fmtInt(result.added)} added
          {result.duplicates > 0 && (
            <span className="text-ink-500 font-normal">
              {" "}
              · {fmtInt(result.duplicates)} duplicates skipped
            </span>
          )}
        </p>
      )}
      {error && (
        <p className="text-[11.5px] text-rose-700 font-semibold max-w-xs text-right">
          {error}
        </p>
      )}
    </div>
  );
}

// ── KPI grid ───────────────────────────────────────────────────────────────

function KpiGrid({ insights }) {
  const overallConvRate =
    insights.transactions > 0
      ? insights.conversions / insights.transactions
      : null;
  const tiles = [
    {
      label: "Revenue",
      value: fmtMoney(insights.revenue),
      icon: DollarSign,
      accent: "bg-emerald-50 text-emerald-700",
      sub: insights.avgRevenuePerConversion
        ? `${fmtMoney(insights.avgRevenuePerConversion)} avg / conv.`
        : null,
    },
    {
      label: "Conversions",
      value: fmtInt(insights.conversions),
      icon: Target,
      accent: "bg-brand-50 text-brand-700",
      sub:
        overallConvRate != null
          ? `${fmtPct(overallConvRate)} of transactions`
          : null,
    },
    {
      label: "Unique users",
      value: fmtInt(insights.uniqueUsers),
      icon: Users,
      accent: "bg-violet-50 text-violet-700",
      sub:
        insights.eventsPerUser != null
          ? `~${insights.eventsPerUser.toFixed(1)} events / user`
          : null,
    },
    {
      label: "Repeat-user share",
      value: fmtPct(insights.repeatUserShare, 1),
      icon: Repeat,
      accent: "bg-amber-50 text-amber-700",
      sub:
        insights.repeatUsers > 0
          ? `${fmtInt(insights.repeatUsers)} users came back`
          : "Most users visited once",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="surface px-4 py-3.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[11px] font-bold uppercase analytics-wider text-ink-500">
                {t.label}
              </p>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${t.accent}`}
              >
                <Icon size={13} />
              </span>
            </div>
            <p className="text-2xl font-bold tabular text-ink-900 leading-tight">
              {t.value}
            </p>
            {t.sub && (
              <p className="text-[11px] text-ink-500 mt-1 leading-tight">
                {t.sub}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Funnel ─────────────────────────────────────────────────────────────────

function FunnelCard({ insights }) {
  const { funnel } = insights;
  const first = funnel[0]?.count || 0;
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-4">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <TrendingUp size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Funnel
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Learn More → CTC → Conversion, linked by transaction_id. Drop-off
            tells you where the leak is.
          </p>
        </div>
      </div>

      <ol className="space-y-2">
        {funnel.map((stage, i) => {
          const widthPct =
            first > 0 ? Math.max(4, (stage.count / first) * 100) : 0;
          const colors = ["bg-brand-500", "bg-violet-500", "bg-emerald-500"];
          return (
            <li key={stage.key}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[12px] font-semibold text-ink-800">
                  {stage.label}
                </span>
                <span className="text-[12px] tabular text-ink-700">
                  <span className="font-bold text-ink-900">
                    {fmtInt(stage.count)}
                  </span>
                  <span className="text-ink-500">
                    {" "}
                    · {fmtPct(stage.rateFromFirst)} of step 1
                  </span>
                  {stage.rateFromPrev != null && i > 0 && (
                    <span className="text-ink-500">
                      {" "}
                      · {fmtPct(stage.rateFromPrev)} from previous
                    </span>
                  )}
                </span>
              </div>
              <div className="h-4 w-full bg-ink-100 rounded-md overflow-hidden">
                <div
                  className={`h-full ${colors[i % colors.length]} transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── User quality card ─────────────────────────────────────────────────────

function UserQualityCard({ insights }) {
  const rows = [
    {
      label: "Unique users",
      value: fmtInt(insights.uniqueUsers),
    },
    {
      label: "Events per user",
      value: insights.eventsPerUser?.toFixed(2) ?? "—",
    },
    {
      label: "Conversions per user",
      value:
        insights.convPerUser != null ? insights.convPerUser.toFixed(3) : "—",
    },
    {
      label: "Repeat users",
      value: `${fmtInt(insights.repeatUsers)} (${fmtPct(insights.repeatUserShare, 1)})`,
    },
    {
      label: "Revenue from repeat users",
      value: insights.revenueFromRepeat
        ? `${fmtMoney(insights.revenueFromRepeat)} (${fmtPct(
            insights.revenue > 0
              ? insights.revenueFromRepeat / insights.revenue
              : 0,
            1,
          )})`
        : "—",
    },
    {
      label: "Top-3 states concentration",
      value: fmtPct(insights.geoConcentrationTop3, 1),
    },
  ];
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Users size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            User quality
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            How many real people, how often they come back, where they live.
          </p>
        </div>
      </div>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between text-[12px]"
          >
            <dt className="text-ink-600">{r.label}</dt>
            <dd className="font-bold text-ink-900 tabular">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Latency card ───────────────────────────────────────────────────────────

function LatencyCard({ insights }) {
  const buckets = insights.latencyBuckets || [];
  const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const maxRev = Math.max(1, ...buckets.map((b) => b.revenue));
  const maxAvg = Math.max(0, ...buckets.map((b) => b.avgRevenue || 0));

  // Winners: highest absolute revenue + (separately) highest avg revenue
  // per conversion. They can be the same bucket; that's fine, we only
  // tag the second badge when they're different.
  let bestByRevenue = null;
  let bestByAvg = null;
  for (const b of buckets) {
    if (b.revenue > 0 && (!bestByRevenue || b.revenue > bestByRevenue.revenue)) {
      bestByRevenue = b;
    }
    if (
      b.count >= 2 &&
      b.avgRevenue > 0 &&
      (!bestByAvg || b.avgRevenue > bestByAvg.avgRevenue)
    ) {
      bestByAvg = b;
    }
  }

  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Clock size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Click → conversion latency
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Median {fmtHrs(insights.medianLatencyHours)} · p90{" "}
            {fmtHrs(insights.p90LatencyHours)} · avg{" "}
            {fmtHrs(insights.avgLatencyHours)} · total{" "}
            <span className="font-semibold text-ink-700">
              {fmtMoney(totalRevenue)}
            </span>{" "}
            from {fmtInt(totalCount)} conv.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {buckets.map((b) => {
          const isBestRev =
            bestByRevenue && b.key === bestByRevenue.key && b.revenue > 0;
          const isBestAvg =
            bestByAvg &&
            b.key === bestByAvg.key &&
            (!bestByRevenue || bestByAvg.key !== bestByRevenue.key);
          const widthRev = (b.revenue / maxRev) * 100;
          return (
            <li
              key={b.key}
              className={`rounded-lg px-2.5 py-2 ${
                isBestRev
                  ? "ring-1 ring-emerald-200 bg-emerald-50/50"
                  : "ring-1 ring-transparent"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-0.5 flex-wrap">
                <span className="text-[12px] font-semibold text-ink-900 inline-flex items-center gap-1.5">
                  {b.label}
                  {isBestRev && (
                    <span className="text-[9px] font-bold uppercase analytics-wider text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">
                      Top revenue
                    </span>
                  )}
                  {isBestAvg && (
                    <span className="text-[9px] font-bold uppercase analytics-wider text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                      Highest avg
                    </span>
                  )}
                </span>
                <span className="text-[11.5px] tabular text-ink-700">
                  <span className="font-bold text-ink-900">
                    {fmtMoney(b.revenue)}
                  </span>
                  {totalRevenue > 0 && (
                    <span className="text-ink-500">
                      {" "}
                      · {fmtPct(b.revShare, 1)} of rev
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-ink-500 mb-1 tabular">
                <span>
                  <span className="font-semibold text-ink-700">
                    {fmtInt(b.count)}
                  </span>{" "}
                  conv
                  {totalCount > 0 && (
                    <span>
                      {" "}
                      · {fmtPct(b.countShare, 1)} of conv
                    </span>
                  )}
                </span>
                <span>
                  {b.count > 0 ? (
                    <>
                      <span className="font-semibold text-ink-700">
                        {fmtMoney(b.avgRevenue)}
                      </span>{" "}
                      avg / conv
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    isBestRev ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${widthRev}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {bestByRevenue && totalRevenue > 0 && (
        <div className="mt-3 rounded-lg ring-1 ring-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="text-[11px] text-ink-700 leading-relaxed">
            <span className="font-bold text-amber-800">
              {bestByRevenue.label}
            </span>{" "}
            drives{" "}
            <span className="font-bold text-ink-900">
              {fmtPct(bestByRevenue.revShare, 1)}
            </span>{" "}
            of revenue ({fmtMoney(bestByRevenue.revenue)} from{" "}
            {fmtInt(bestByRevenue.count)} conversions).
            {bestByAvg &&
              bestByRevenue.key !== bestByAvg.key &&
              maxAvg > bestByRevenue.avgRevenue * 1.1 && (
                <>
                  {" "}
                  But{" "}
                  <span className="font-bold text-amber-800">
                    {bestByAvg.label}
                  </span>{" "}
                  buyers spend more per head — avg{" "}
                  <span className="font-bold text-ink-900">
                    {fmtMoney(bestByAvg.avgRevenue)}
                  </span>{" "}
                  vs {fmtMoney(bestByRevenue.avgRevenue)} in the top-volume
                  band.
                </>
              )}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Quality / fraud signals ───────────────────────────────────────────────

function QualitySignalsCard({ insights }) {
  const q = insights.qualitySignals;
  const items = [
    {
      label: "Heavy IPs (5+ events)",
      value: fmtInt(q.heavyIPs),
      sub:
        q.heavyIPEventShare != null
          ? `${fmtPct(q.heavyIPEventShare, 1)} of total events`
          : null,
      tone: q.heavyIPEventShare && q.heavyIPEventShare > 0.25 ? "warn" : "ok",
    },
    {
      label: "Instant conversions (≤0s)",
      value: fmtInt(q.instantConversions),
      sub:
        q.instantConversionShare != null
          ? `${fmtPct(q.instantConversionShare, 1)} of conversions`
          : null,
      tone:
        q.instantConversionShare && q.instantConversionShare > 0.4
          ? "warn"
          : "ok",
    },
    {
      label: "User-agents on >1 IP",
      value: fmtInt(q.sharedUAs),
      sub: "Could be carrier NAT — or a click cluster",
      tone: q.sharedUAs > 50 ? "warn" : "ok",
    },
  ];
  const anyWarn = items.some((i) => i.tone === "warn");
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span
          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full ${
            anyWarn
              ? "bg-rose-100 text-rose-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          <AlertTriangle size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Quality signals
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Patterns that don't prove fraud but are worth a second look.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.label}
            className={`rounded-lg px-3 py-2 ring-1 ${
              it.tone === "warn"
                ? "ring-rose-200 bg-rose-50/60"
                : "ring-ink-200 bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-semibold text-ink-800">
                {it.label}
              </span>
              <span
                className={`text-[12.5px] font-bold tabular ${
                  it.tone === "warn" ? "text-rose-700" : "text-ink-900"
                }`}
              >
                {it.value}
              </span>
            </div>
            {it.sub && (
              <p className="text-[10.5px] text-ink-500 mt-0.5">{it.sub}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Daily trend chart ──────────────────────────────────────────────────────

// Recharts uses the `name` prop on each Line for both tooltip + legend.
// Anything formatted in USD gets matched by the friendly name below so the
// tooltip can pick fmtMoney vs fmtInt without checking the raw dataKey.
const USD_SERIES = new Set([
  "Revenue",
  "Spend (Meta)",
  "Avg / conv",
]);

function DailyTrendCard({ dailyTrend, spendByDate }) {
  const data = useMemo(
    () =>
      dailyTrend.map((d) => {
        const spendRaw = spendByDate?.get(d.date);
        const spend =
          spendRaw != null && spendRaw > 0
            ? Math.round(spendRaw * 100) / 100
            : null;
        const avgPerConv =
          d.conversions > 0
            ? Math.round((d.revenue / d.conversions) * 100) / 100
            : null;
        return {
          date: d.date.slice(5),
          events: d.events,
          conversions: d.conversions,
          uniqueUsers: d.uniqueUsers,
          revenue: Math.round(d.revenue * 100) / 100,
          spend,
          avgPerConv,
        };
      }),
    [dailyTrend, spendByDate],
  );

  const hasMeta = data.some((d) => d.spend != null);
  const hasAvg = data.some((d) => d.avgPerConv != null);

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Activity size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Daily trend
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Conversions, unique users, and revenue per day
            {hasMeta && (
              <>
                {" "}
                — plus Meta{" "}
                <span className="font-semibold text-amber-700">spend</span> and
                analytics{" "}
                <span className="font-semibold text-rose-700">avg / conv</span>{" "}
                from the linked Meta campaign{spendByDate?.size > 0 ? "(s)" : ""}
              </>
            )}
            .
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={hasMeta ? 280 : 240}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v) =>
              `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
            }
          />
          <Tooltip
            content={
              <MinimalTooltip
                formatter={(v, name) =>
                  v == null
                    ? "—"
                    : USD_SERIES.has(name)
                      ? fmtMoney(v)
                      : fmtInt(v)
                }
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            height={24}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "#3a3b3c" }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="conversions"
            name="Conversions"
            stroke="#1877f2"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="uniqueUsers"
            name="Unique users"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          {hasMeta && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="spend"
              name="Spend (Meta)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
            />
          )}
          {hasAvg && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="avgPerConv"
              name="Avg / conv"
              stroke="#e11d48"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={{ r: 2 }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Ranked list (geo / device / platform / browser / carrier / isp / etc.) ─

function RankedListCard({
  icon: Icon,
  title,
  sub,
  rows,
  totalConversions,
  showRevenue = false,
  showUsers = false,
  emptyText,
}) {
  const list = (rows || []).slice(0, 8);
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
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

      {list.length === 0 ? (
        <p className="text-[12px] text-ink-500 italic py-3">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {list.map((row, idx) => {
            const share =
              totalConversions > 0 ? row.conversions / totalConversions : 0;
            const widthPct =
              list[0].events > 0 ? (row.events / list[0].events) * 100 : 0;
            return (
              <li
                key={`${row.key}-${idx}`}
                className="py-2 first:pt-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span
                    className="text-[12.5px] font-semibold text-ink-900 truncate"
                    title={row.key}
                  >
                    {row.key}
                  </span>
                  <span className="text-[11.5px] tabular text-ink-700 whitespace-nowrap">
                    <span className="font-bold text-ink-900">
                      {fmtInt(row.events)}
                    </span>{" "}
                    ev
                    {showUsers && (
                      <span className="text-ink-500">
                        {" "}
                        · {fmtInt(row.uniqueUsers)} users
                      </span>
                    )}
                    {row.conversions > 0 && (
                      <span className="text-ink-500">
                        {" "}
                        · {fmtInt(row.conversions)} conv
                      </span>
                    )}
                    {showRevenue && row.revenue > 0 && (
                      <span className="text-ink-500">
                        {" "}
                        · {fmtMoney(row.revenue)}
                      </span>
                    )}
                    {totalConversions > 0 && row.conversions > 0 && (
                      <span className="text-ink-400"> · {fmtPct(share)}</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── In-app vs web surface ──────────────────────────────────────────────────

function SurfaceSplitCard({ surfaceSplit }) {
  const total = surfaceSplit.reduce((s, r) => s + r.events, 0);
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Smartphone size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            In-app vs native browser
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            In-app browsers (FB, IG, Messenger) usually convert worse than the
            phone's default browser.
          </p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {surfaceSplit.map((row) => {
          const share = total > 0 ? row.events / total : 0;
          const cr = row.events > 0 ? row.conversions / row.events : 0;
          return (
            <li key={row.key}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[12.5px] font-semibold text-ink-800">
                  {row.label}
                </span>
                <span className="text-[12px] tabular text-ink-700">
                  <span className="font-bold text-ink-900">
                    {fmtInt(row.events)}
                  </span>{" "}
                  ev
                  <span className="text-ink-500">
                    {" "}
                    · {fmtInt(row.conversions)} conv
                  </span>
                  <span className="text-ink-500"> · CR {fmtPct(cr, 2)}</span>
                  {row.revenue > 0 && (
                    <span className="text-ink-500">
                      {" "}
                      · {fmtMoney(row.revenue)}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full bg-ink-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    row.key === "inApp" ? "bg-violet-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Day of week ────────────────────────────────────────────────────────────

function DayOfWeekCard({ byDayOfWeek }) {
  const data = byDayOfWeek;
  const max = Math.max(1, ...data.map((d) => d.events));
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Calendar size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Day of week
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Which weekdays are pulling traffic, in UTC.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.dow}>
            <div className="flex items-baseline justify-between text-[12px] mb-0.5">
              <span className="text-ink-700 font-semibold w-10">{d.label}</span>
              <span className="tabular text-ink-700">
                <span className="font-bold text-ink-900">
                  {fmtInt(d.events)}
                </span>{" "}
                ev
                <span className="text-ink-500">
                  {" "}
                  · {fmtInt(d.conversions)} conv
                </span>
                {d.revenue > 0 && (
                  <span className="text-ink-500"> · {fmtMoney(d.revenue)}</span>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(d.events / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Hour-of-day chart ──────────────────────────────────────────────────────

function HourOfDayCard({ byHour }) {
  const data = byHour.map((h) => ({
    hour: h.hour.toString().padStart(2, "0"),
    conversions: h.conversions,
  }));
  const peak = byHour.reduce(
    (a, b) => (b.conversions > a.conversions ? b : a),
    byHour[0],
  );

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Clock size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Hour of day
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            When conversions land (UTC, from event timestamps).{" "}
            {peak && peak.conversions > 0 && (
              <span className="font-semibold text-amber-700">
                Peak: {peak.hour}:00 ({fmtInt(peak.conversions)} conv.)
              </span>
            )}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#f0f2f5" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8a8d91" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "#f0f2f5" }}
            content={<MinimalTooltip formatter={(v) => `${fmtInt(v)} conv.`} />}
          />
          <Bar dataKey="conversions" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  peak && d.hour === peak.hour.toString().padStart(2, "0")
                    ? "#f59e0b"
                    : "#fcd34d"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Top engaged users ──────────────────────────────────────────────────────

function TopUsersCard({ topEngagedUsers }) {
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Users size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Top engaged users
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Highest-volume IPs. Real power users + the occasional click cluster
            both show up here — the city, device, and brand make it easier to
            tell them apart.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100">
              <th className="py-2 font-semibold">IP</th>
              <th className="py-2 font-semibold">Location</th>
              <th className="py-2 font-semibold">Device</th>
              <th className="py-2 font-semibold text-right">Events</th>
              <th className="py-2 font-semibold text-right">Txns</th>
              <th className="py-2 font-semibold text-right">Conv</th>
              <th className="py-2 font-semibold text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {topEngagedUsers.map((u) => (
              <tr key={u.ip} className="border-b border-ink-100 last:border-0">
                <td className="py-2 font-mono text-[11px] text-ink-700">
                  {u.ip}
                </td>
                <td className="py-2 text-ink-700">
                  {[u.city, u.region].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="py-2 text-ink-700">
                  {[u.device, u.platform, u.brand]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="py-2 text-right tabular font-bold text-ink-900">
                  {fmtInt(u.events)}
                </td>
                <td className="py-2 text-right tabular text-ink-700">
                  {fmtInt(u.transactions)}
                </td>
                <td className="py-2 text-right tabular text-ink-700">
                  {fmtInt(u.conversions)}
                </td>
                <td className="py-2 text-right tabular text-emerald-700 font-semibold">
                  {u.revenue > 0 ? fmtMoney(u.revenue) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Top conversions ────────────────────────────────────────────────────────

function TopConversionsCard({ topConversions }) {
  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Award size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Top conversions by revenue
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            The richest single conversions in the dataset — look for patterns in
            device, offer, and region.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-500 border-b border-ink-100">
              <th className="py-2 font-semibold">Date</th>
              <th className="py-2 font-semibold">Offer</th>
              <th className="py-2 font-semibold">Type</th>
              <th className="py-2 font-semibold">Location</th>
              <th className="py-2 font-semibold">Surface</th>
              <th className="py-2 font-semibold text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {topConversions.map((c) => (
              <tr
                key={c.conversion_id}
                className="border-b border-ink-100 last:border-0"
              >
                <td className="py-2 text-ink-700">{c.date?.slice(0, 16)}</td>
                <td className="py-2 text-ink-700">{c.offer || "—"}</td>
                <td className="py-2 text-ink-700">{c.revenue_type || "—"}</td>
                <td className="py-2 text-ink-700">
                  {[c.city, c.region].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="py-2 text-ink-700">
                  {[c.device_type, c.platform].filter(Boolean).join(" · ")}
                </td>
                <td className="py-2 text-right tabular font-bold text-emerald-700">
                  {fmtMoney(c.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Uploads manager ────────────────────────────────────────────────────────

function UploadsManager({ uploads, campaignId, onChanged }) {
  const enabledUploads = uploads.filter((u) => u.enabled !== false);
  const disabledCount = uploads.length - enabledUploads.length;
  const disabledEvents = uploads
    .filter((u) => u.enabled === false)
    .reduce((s, u) => s + (u.events || u.added || 0), 0);
  const isLastEnabled = (u) =>
    u.enabled !== false && enabledUploads.length === 1;

  return (
    <div className="surface px-5 py-5">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <FileText size={14} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink-900 leading-tight">
            Uploads ({uploads.length})
          </h3>
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">
            Every CSV you've uploaded into this campaign. Toggle the switch
            to exclude an upload from insights without deleting it — flip it
            back on anytime. At least one upload must stay enabled; use
            Remove if you want the data gone.
          </p>
          {disabledCount > 0 && (
            <p className="text-[11px] text-amber-700 mt-1 font-semibold">
              {disabledCount} upload{disabledCount === 1 ? "" : "s"} disabled
              · {fmtInt(disabledEvents)} events excluded from insights & match
            </p>
          )}
        </div>
      </div>
      {uploads.length === 0 ? (
        <p className="text-[12px] text-ink-500 italic">No uploads yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {uploads.map((u) => (
            <UploadRow
              key={u.id}
              upload={u}
              campaignId={campaignId}
              onChanged={onChanged}
              toggleLocked={isLastEnabled(u)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadRow({ upload, campaignId, onChanged, toggleLocked = false }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(null);

  const enabled = upload.enabled !== false;

  const handleDelete = async () => {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/analytics/campaigns/${campaignId}/uploads/${upload.id}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (j.success) {
        setConfirming(false);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async () => {
    if (toggleLocked) return;
    setToggling(true);
    setToggleError(null);
    try {
      const r = await fetch(
        `/api/analytics/campaigns/${campaignId}/uploads/${upload.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !enabled }),
        },
      );
      const j = await r.json();
      if (j.success) {
        onChanged?.();
      } else {
        setToggleError(j.error || "Couldn't change state");
      }
    } catch (e) {
      setToggleError(e.message);
    } finally {
      setToggling(false);
    }
  };

  return (
    <li
      className={`py-3 flex items-start gap-3 transition-opacity ${
        enabled ? "" : "opacity-60"
      }`}
    >
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
          enabled ? "bg-ink-100 text-ink-700" : "bg-ink-100 text-ink-400"
        }`}
      >
        <FileText size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`text-[13px] font-semibold truncate ${
              enabled ? "text-ink-900" : "text-ink-600 line-through"
            }`}
            title={upload.filename}
          >
            {upload.filename}
          </p>
          {!enabled && (
            <span className="text-[10px] font-bold uppercase analytics-wider text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
              Disabled
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-500 mt-0.5">
          <span className="font-semibold text-ink-700 tabular">
            {fmtInt(upload.events || upload.added || 0)}
          </span>{" "}
          events {enabled ? "in use" : "ignored"}
          {upload.duplicates > 0 && (
            <span> · {fmtInt(upload.duplicates)} duplicates skipped</span>
          )}
          {upload.rowsRead != null && upload.rowsRead !== upload.added && (
            <span> · from {fmtInt(upload.rowsRead)} CSV rows</span>
          )}
          {upload.uploadedAt && (
            <span>
              {" "}
              · {timeAgo(upload.uploadedAt)} (
              {new Date(upload.uploadedAt).toLocaleString()})
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <ToggleSwitch
          enabled={enabled}
          busy={toggling}
          locked={toggleLocked}
          onToggle={handleToggle}
        />
        {toggleLocked && (
          <span
            className="text-[9.5px] font-semibold text-ink-500"
            title="At least one upload must stay enabled"
          >
            Last one
          </span>
        )}
        {toggleError && (
          <span className="text-[9.5px] font-semibold text-rose-700 max-w-32 text-right">
            {toggleError}
          </span>
        )}
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-[11.5px] font-semibold text-ink-700 hover:text-ink-900 px-2 py-1"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 text-white text-[11.5px] font-bold px-2.5 py-1 hover:bg-rose-700 disabled:opacity-60"
          >
            <Trash2 size={11} />
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 rounded-lg ring-1 ring-rose-200 bg-white text-rose-700 text-[11.5px] font-semibold px-2.5 py-1 hover:bg-rose-50"
        >
          <Trash2 size={11} />
          Remove
        </button>
      )}
    </li>
  );
}

// Compact iOS-style toggle. Used on each upload row so the user can
// flip a CSV out of the insights without losing the data.
function ToggleSwitch({ enabled, busy, onToggle, locked = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-disabled={locked || busy}
      disabled={busy || locked}
      onClick={onToggle}
      title={
        locked
          ? "At least one upload must stay enabled — use Remove to delete instead"
          : enabled
            ? "Disable this upload"
            : "Enable this upload"
      }
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-emerald-500" : "bg-ink-300"
      } ${busy ? "opacity-60" : ""} ${locked ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Danger zone ────────────────────────────────────────────────────────────

function DangerZone({ campaignId, campaignName }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      await fetch(`/api/analytics/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      window.location.href = "/analytics";
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl ring-1 ring-rose-200 bg-rose-50/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700">
          <Trash2 size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold text-ink-900 leading-tight">
            Delete this campaign
          </p>
          <p className="text-[11.5px] text-ink-600 mt-0.5 leading-relaxed">
            Removes "{campaignName}" and every event uploaded to it. Cannot be
            undone.
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="rounded-lg bg-rose-600 text-white text-xs font-bold px-3 py-1.5 hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg ring-1 ring-ink-200 bg-white text-ink-700 text-xs font-semibold px-3 py-1.5 hover:bg-ink-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg ring-1 ring-rose-300 bg-white text-rose-700 text-xs font-semibold px-3 py-1.5 hover:bg-rose-50"
          >
            Delete…
          </button>
        )}
      </div>
    </div>
  );
}
