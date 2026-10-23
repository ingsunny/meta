// Standard page frame inside the app shell: optional sticky toolbar, then a
// padded content column. Sections with their own toolbars (Ads Manager)
// pass `toolbar`; simple pages just pass a title.

export function PageFrame({ title, sub, eyebrow, actions, toolbar, children, wide = false }) {
  return (
    <>
      {toolbar && (
        <div className="sticky top-14 lg:top-0 z-30 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur-md">
          <div className={`mx-auto ${wide ? "max-w-[1400px]" : "max-w-7xl"} px-5 lg:px-8 h-14 flex items-center justify-between gap-3`}>
            {toolbar}
          </div>
        </div>
      )}
      <main className={`mx-auto ${wide ? "max-w-[1400px]" : "max-w-7xl"} px-5 lg:px-8 pb-24`}>
        {title && (
          <header className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-7">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-600 mb-2">{eyebrow}</p>
              )}
              <h1 className="font-display text-[38px] leading-[1.05] text-ink-900">{title}</h1>
              {sub && <p className="mt-2 text-[15px] text-ink-600 max-w-2xl">{sub}</p>}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
          </header>
        )}
        {children}
      </main>
    </>
  );
}
