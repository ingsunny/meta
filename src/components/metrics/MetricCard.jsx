export function MetricCard({ label, value, sub, tone = "default", icon: Icon, accent }) {
  const valueColor = {
    default: "text-ink-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
    muted: "text-ink-400",
    brand: "text-brand-600",
  }[tone];

  return (
    <div className="surface px-4 py-3.5 flex items-start gap-3">
      {Icon && (
        <div
          className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
            accent || "bg-brand-50 text-brand-600"
          }`}
        >
          <Icon size={16} strokeWidth={2.25} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
          {label}
        </p>
        <p
          className={`mt-0.5 text-xl font-semibold tabular tracking-tight leading-tight ${valueColor}`}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-[11px] text-ink-500">{sub}</p>}
      </div>
    </div>
  );
}

export function MetricGrid({ children, cols = 4 }) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  }[cols];
  return <div className={`grid ${gridCols} gap-3`}>{children}</div>;
}
