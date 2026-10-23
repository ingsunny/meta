import Link from "next/link";
import { FileSpreadsheet, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listReports } from "@/lib/reports/storage";
import { PageFrame } from "@/components/shell/PageFrame";
import { ReportUpload } from "@/components/reports/ReportUpload";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function money(n, currency = "USD") {
  if (n == null) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  }
}
const num = (n) => (n == null ? null : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n));

function span(from, to) {
  if (!from) return null;
  const f = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return from === to || !to ? f(from) : `${f(from)} – ${f(to)}`;
}

export default async function ReportsPage() {
  const user = await requireUser();
  const reports = await listReports(user.id);

  return (
    <PageFrame
      eyebrow="Reports"
      title="Turn any export into a report"
      sub="Upload a spreadsheet from Meta Ads Manager — or anywhere else. We detect the metrics, total them correctly, and chart them. No connection required."
    >
      <ReportUpload />

      <div className="mt-12 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-500">Your reports</h2>
        <p className="text-xs text-ink-500">{reports.length} total</p>
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Nothing here yet. Your first upload shows up here.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((r) => {
            const s = r.summary || {};
            const stats = [
              s.spend != null && ["Spend", money(s.spend, s.currency)],
              s.impressions != null && ["Impr.", num(s.impressions)],
              s.results != null && ["Results", num(s.results)],
            ].filter(Boolean);
            return (
              <Link key={r.id} href={`/reports/${r.id}`} className="group surface hover:shadow-lift transition p-5 block">
                <div className="flex items-start gap-3">
                  <span
                    className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${
                      r.source === "meta" ? "bg-brand-50 text-brand-600" : "bg-[#e6f6f3] text-[#1f8a7d]"
                    }`}
                  >
                    <FileSpreadsheet size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-ink-900 truncate">{r.name}</p>
                    <p className="text-xs text-ink-500 truncate">
                      {[span(r.dateFrom, r.dateTo), `${r.rowCount.toLocaleString()} rows`, r.source === "meta" ? "Meta export" : "Spreadsheet"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ArrowUpRight size={16} className="text-ink-300 group-hover:text-ink-700 transition" />
                </div>
                {stats.length > 0 && (
                  <dl className="mt-5 grid grid-cols-3 gap-3">
                    {stats.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-ink-500">{k}</dt>
                        <dd className="font-mono text-[15px] text-ink-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
