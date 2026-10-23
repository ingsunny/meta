export function MinimalTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-ink-200 shadow-sm text-xs">
      {label && <p className="font-medium text-ink-800 mb-1.5">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="h-2 w-2 rounded-sm shrink-0"
              style={{ background: p.color || p.fill }}
            />
            <span className="text-ink-500 truncate max-w-40">{p.name}</span>
            <span className="ml-auto tabular font-semibold text-ink-800">
              {formatter ? formatter(p.value, p.name) : p.value?.toLocaleString?.("en-IN") ?? p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
