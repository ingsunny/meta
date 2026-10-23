import { scoreTier } from "@/lib/meta/metrics";

const TONE_STROKE = {
  good: "#31a24c",
  warn: "#c47f00",
  bad: "#e02d3c",
};
const TONE_BG = {
  good: "#e3f5e7",
  warn: "#fff4d6",
  bad: "#ffe7e9",
};
const TONE_TEXT = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
};

export function ScoreBadge({ score, size = "md", showLabel = true }) {
  const { label, tone } = scoreTier(score);
  const sizes = {
    sm: { ring: "h-10 w-10", text: "text-xs" },
    md: { ring: "h-12 w-12", text: "text-sm" },
    lg: { ring: "h-16 w-16", text: "text-lg" },
  }[size];

  const r = 19;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const stroke = TONE_STROKE[tone];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${sizes.ring}`}>
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
          <circle
            cx="22"
            cy="22"
            r={r}
            fill={TONE_BG[tone]}
            stroke="#ffffff"
            strokeWidth="0"
          />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="3"
          />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center tabular font-bold ${sizes.text} ${TONE_TEXT[tone]}`}
        >
          {score}
        </span>
      </div>
      {showLabel && (
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${TONE_TEXT[tone]}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

import { statusInfo } from "@/lib/meta/status";

const TONE_PILL = {
  good: { bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  warn: { bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  bad: { bg: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  neutral: { bg: "bg-ink-100 text-ink-500", dot: "bg-ink-400" },
};

export function StatusPill({ node }) {
  const { label, tone } = statusInfo(node);
  const cls = TONE_PILL[tone] || TONE_PILL.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
      {label}
    </span>
  );
}

const OBJ_DOT = {
  LEADS: "bg-violet-500",
  TRAFFIC: "bg-blue-500",
  AWARENESS: "bg-cyan-500",
  SALES: "bg-emerald-500",
  ENGAGEMENT: "bg-amber-500",
  APP_PROMOTION: "bg-pink-500",
};

export function ObjectiveTag({ objective, config }) {
  const key = (objective || "").replace("OUTCOME_", "");
  const dot = OBJ_DOT[key] || "bg-ink-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {config.label}
    </span>
  );
}
