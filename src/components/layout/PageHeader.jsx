export function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pt-7 pb-5">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="mb-2">
            {typeof eyebrow === "string" ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                {eyebrow}
              </p>
            ) : (
              eyebrow
            )}
          </div>
        )}
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900 leading-tight">
          {title}
        </h1>
        {sub && <p className="mt-1.5 text-sm text-ink-600 max-w-2xl">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
