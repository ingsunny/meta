import Link from "next/link";
import { ArrowRight, Megaphone, LineChart, FileSpreadsheet, Check, Plug } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getMetaIntegration } from "@/lib/integrations/meta";
import { countReports, listReports } from "@/lib/reports/storage";
import { listCampaigns } from "@/lib/analytics/storage";
import { PageFrame } from "@/components/shell/PageFrame";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ToolCard({ href, icon: Icon, tone, name, body, meta, cta }) {
  return (
    <Link href={href} className="group surface hover:shadow-lift transition p-6 flex flex-col">
      <span className={`h-11 w-11 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon size={20} />
      </span>
      <p className="mt-5 text-[17px] font-semibold text-ink-900">{name}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600 flex-1">{body}</p>
      <div className="mt-6 flex items-center justify-between text-[13px]">
        <span className="text-ink-500">{meta}</span>
        <span className="inline-flex items-center gap-1 font-medium text-ink-900">
          {cta}
          <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const [meta, reports, reportCount, campaigns] = await Promise.all([
    getMetaIntegration(user.id),
    listReports(user.id, { limit: 5 }),
    countReports(user.id),
    listCampaigns(),
  ]);
  const metaActive = meta?.status === "active";
  const accountCount = meta?.accounts.length || 0;
  const activeAccounts = meta?.accounts.filter((a) => a.account_status === 1).length || 0;
  const first = user.name.split(/\s+/)[0];

  const steps = [
    { done: true, label: "Create your account", href: null },
    { done: metaActive, label: "Connect Meta", href: "/integrations" },
    { done: reports.length > 0, label: "Upload your first report", href: "/reports" },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <PageFrame>
      <header className="pt-12 pb-8">
        <p className="text-[13px] text-ink-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="font-display mt-2 text-[48px] leading-[1.02] text-ink-900">
          {greeting()}, <span className="italic">{first}</span>.
        </h1>
        <p className="mt-3 text-[15px] text-ink-600">Where do you want to start?</p>
      </header>

      {!allDone && (
        <div className="surface grain mb-8 p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className="text-sm font-medium text-ink-900">Get set up</p>
          {steps.map((s) => {
            const inner = (
              <span className={`inline-flex items-center gap-2 text-sm ${s.done ? "text-ink-500" : "text-ink-900"}`}>
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    s.done ? "bg-good text-white" : "ring-1 ring-ink-300 bg-white"
                  }`}
                >
                  {s.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={s.done ? "line-through decoration-ink-300" : ""}>{s.label}</span>
              </span>
            );
            return s.href && !s.done ? (
              <Link key={s.label} href={s.href} className="hover:text-brand-600">
                {inner}
              </Link>
            ) : (
              <span key={s.label}>{inner}</span>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ToolCard
          href={metaActive ? "/meta" : "/integrations"}
          icon={Megaphone}
          tone="bg-brand-50 text-brand-600"
          name="Ads Manager"
          body="Campaigns, ad sets and ads across every Meta account you can access. Compare, break down, preview creatives."
          meta={
            metaActive
              ? `${accountCount} account${accountCount === 1 ? "" : "s"} · ${activeAccounts} active`
              : "Meta not connected"
          }
          cta={metaActive ? "Open" : "Connect"}
        />
        <ToolCard
          href="/analytics"
          icon={LineChart}
          tone="bg-[#fdf3e3] text-[#b7791f]"
          name="Analytics"
          body="Upload conversion exports from your tracker and see revenue, funnel quality, geo and device patterns — matched against Meta spend."
          meta={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
          cta="Open"
        />
        <ToolCard
          href="/reports"
          icon={FileSpreadsheet}
          tone="bg-[#e6f6f3] text-[#1f8a7d]"
          name="Reports"
          body="Drop in any Meta Ads Manager export (.xlsx or .csv) and get KPIs, trends and a grouped table instantly."
          meta={`${reportCount || "No"} report${reportCount === 1 ? "" : "s"}`}
          cta="Open"
        />
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface">
          <div className="px-5 py-4 flex items-center justify-between border-b border-ink-200/70">
            <h2 className="text-sm font-medium text-ink-900">Recent reports</h2>
            <Link href="/reports" className="text-[13px] text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {reports.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500">No reports yet. Upload an export to create one.</p>
          ) : (
            <ul className="divide-y divide-ink-200/60">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-ink-50/60">
                    <FileSpreadsheet size={16} className="text-ink-400" />
                    <span className="flex-1 min-w-0 truncate text-sm text-ink-900">{r.name}</span>
                    <span className="text-xs text-ink-500">{r.rowCount.toLocaleString()} rows</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface">
          <div className="px-5 py-4 flex items-center justify-between border-b border-ink-200/70">
            <h2 className="text-sm font-medium text-ink-900">Connections</h2>
            <Link href="/integrations" className="text-[13px] text-brand-600 hover:text-brand-700">
              Manage
            </Link>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-[#e8f0fe] text-[#0866ff] flex items-center justify-center">
              <Plug size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-900">Meta</p>
              <p className="text-xs text-ink-500 truncate">
                {meta ? `${meta.external_name} · ${accountCount} ad accounts` : "Not connected"}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                metaActive ? "bg-good-soft text-good" : meta ? "bg-warn-soft text-warn" : "bg-ink-100 text-ink-500"
              }`}
            >
              {metaActive ? "Connected" : meta ? "Reconnect" : "Off"}
            </span>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
