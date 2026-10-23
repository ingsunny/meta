// Right-hand panel on the auth screens. Deep ink canvas with a dot grid,
// two indigo glows and grain, plus three floating "product" cards drawn in
// code: a KPI tile, a spend sparkline, and an imported-report row.

const SPARK = [12, 18, 15, 22, 20, 28, 26, 34, 31, 39, 44, 42, 51];

function Sparkline() {
  const w = 260;
  const h = 70;
  const max = Math.max(...SPARK);
  const pts = SPARK.map((v, i) => [(i / (SPARK.length - 1)) * w, h - (v / max) * (h - 8) - 4]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[70px]" aria-hidden="true">
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7f86f8" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7f86f8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#hero-area)" />
      <path d={line} fill="none" stroke="#a5abff" strokeWidth="2" strokeLinecap="round" />
      <circle cx={pts.at(-1)[0] - 2} cy={pts.at(-1)[1]} r="3.5" fill="#fff" />
    </svg>
  );
}

export function AuthHero() {
  return (
    <div className="relative hidden lg:flex overflow-hidden bg-[#121218] text-white">
      <div className="absolute inset-0 dot-grid opacity-60" />
      <div className="absolute -top-40 -right-32 h-[520px] w-[520px] rounded-full bg-brand-500/35 blur-[120px]" />
      <div className="absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-[#2bb3a3]/20 blur-[120px]" />
      <div className="grain absolute inset-0" />

      <div className="relative z-10 flex flex-col justify-between w-full p-14 xl:p-20">
        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">
            Ads · Analytics · Reports
          </p>
          <h2 className="font-display mt-5 text-[52px] leading-[1.02]">
            Every account you run,
            <br />
            <span className="italic text-brand-200">in one calm place.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">
            Connect Meta once, then read spend, results and creative performance across all your ad
            accounts. Drop in any export and get a report in seconds.
          </p>
        </div>

        <div className="relative h-[320px] mt-12">
          {/* Spend card */}
          <div className="absolute left-0 top-6 w-[320px] rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-md p-5 animate-float">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/50">Spend · last 14 days</p>
              <span className="rounded-full bg-[#1f9d55]/20 px-2 py-0.5 text-[11px] font-semibold text-[#6ee7a8]">
                +18.4%
              </span>
            </div>
            <p className="mt-2 font-mono text-[28px] font-medium tracking-tight">$24,812</p>
            <Sparkline />
          </div>

          {/* KPI tile */}
          <div
            className="absolute right-4 top-0 w-[200px] rounded-2xl bg-white text-ink-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] p-5 animate-float"
            style={{ animationDelay: "-2s" }}
          >
            <p className="text-xs text-ink-500">Cost per result</p>
            <p className="mt-1 font-mono text-[26px] font-medium tracking-tight">$3.42</p>
            <div className="mt-3 flex gap-1">
              {[40, 55, 48, 70, 62, 85, 78].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-brand-500"
                  style={{ height: h * 0.5, opacity: 0.35 + i * 0.09 }}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-good font-semibold">↓ 12% vs previous</p>
          </div>

          {/* Report row */}
          <div
            className="absolute left-16 bottom-0 w-[380px] rounded-2xl bg-white/[0.08] ring-1 ring-white/10 backdrop-blur-md px-5 py-4 animate-float"
            style={{ animationDelay: "-4s" }}
          >
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-[#2bb3a3]/25 text-[#7be0d4] flex items-center justify-center text-[11px] font-bold">
                XLSX
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Campaigns-Oct-1-2026-Oct-21-2026.xlsx</p>
                <p className="text-xs text-white/50">42 rows · 18 metrics detected</p>
              </div>
              <span className="text-xs font-semibold text-brand-200">Report ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
