export function ChartCard({ title, sub, right, children, footer }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-ink-200/60 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="w-full">{children}</div>
      {footer && <div className="mt-3 text-xs text-ink-500">{footer}</div>}
    </div>
  );
}

export function ChartLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-2 text-xs text-ink-600">
          <span
            className="inline-block h-2 w-3 rounded-sm"
            style={{ background: it.color }}
          />
          <span className="truncate max-w-56">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ message = "No data for this range" }) {
  return (
    <div className="flex items-center justify-center h-50 text-xs text-ink-400">
      {message}
    </div>
  );
}
