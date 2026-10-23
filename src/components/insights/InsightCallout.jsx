import { TrendingUp, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

const TONES = {
  good: {
    Icon: TrendingUp,
    iconBg: "bg-emerald-100 text-emerald-700",
    text: "text-ink-800",
  },
  warn: {
    Icon: AlertTriangle,
    iconBg: "bg-amber-100 text-amber-700",
    text: "text-ink-800",
  },
  bad: {
    Icon: AlertCircle,
    iconBg: "bg-rose-100 text-rose-700",
    text: "text-ink-800",
  },
  info: {
    Icon: Sparkles,
    iconBg: "bg-brand-50 text-brand-600",
    text: "text-ink-800",
  },
};

export function InsightCallout({ tone = "info", text }) {
  const { Icon, iconBg, text: textColor } = TONES[tone] || TONES.info;
  return (
    <div className="surface flex items-start gap-3 px-4 py-3">
      <div
        className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${iconBg}`}
      >
        <Icon size={14} strokeWidth={2.25} />
      </div>
      <p className={`text-[13px] leading-relaxed pt-1 ${textColor}`}>{text}</p>
    </div>
  );
}

export function InsightStack({ callouts }) {
  if (!callouts?.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {callouts.map((c, i) => (
        <InsightCallout key={i} tone={c.tone} text={c.text} />
      ))}
    </div>
  );
}
