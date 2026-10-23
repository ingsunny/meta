import { requireUser } from "@/lib/auth/session";
import { getMetaIntegration, oauthConfigured } from "@/lib/integrations/meta";
import { PageFrame } from "@/components/shell/PageFrame";
import { MetaIntegrationCard } from "@/components/integrations/MetaIntegrationCard";
import { FileSpreadsheet } from "lucide-react";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const UPCOMING = [
  { name: "Google Ads", body: "Search, Performance Max and YouTube campaigns.", mark: "G", tone: "bg-[#e8f0fe] text-[#1a73e8]" },
  { name: "TikTok Ads", body: "Campaign and creative performance from TikTok.", mark: "T", tone: "bg-ink-900 text-white" },
  { name: "Shopify", body: "Orders and revenue to reconcile against ad spend.", mark: "S", tone: "bg-[#e7f6e9] text-[#2f8a3c]" },
];

export default async function IntegrationsPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const integration = await getMetaIntegration(user.id);

  return (
    <PageFrame
      eyebrow="Workspace"
      title="Integrations"
      sub="Connect the platforms you advertise on. Every connection is read-only and private to your account."
    >
      {sp?.error && (
        <p role="alert" className="mb-6 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          {sp.error}
        </p>
      )}
      {sp?.connected === "meta" && (
        <p className="mb-6 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
          Meta connected. Your ad accounts are ready in Ads Manager.
        </p>
      )}

      <MetaIntegrationCard
        integration={integration ? JSON.parse(JSON.stringify(integration)) : null}
        oauthReady={oauthConfigured()}
      />

      <div className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-500 mb-3">Always available</h2>
        <div className="surface p-5 flex items-center gap-4">
          <span className="h-10 w-10 rounded-xl bg-[#e6f6f3] text-[#1f8a7d] flex items-center justify-center">
            <FileSpreadsheet size={19} />
          </span>
          <div className="flex-1">
            <p className="text-[15px] font-medium text-ink-900">File uploads</p>
            <p className="text-[13px] text-ink-600">
              Reports and Analytics accept .xlsx and .csv exports — no connection needed.
            </p>
          </div>
          <span className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-medium text-good">On</span>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-ink-500 mb-3">Coming soon</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {UPCOMING.map((p) => (
            <div key={p.name} className="surface p-5 opacity-80">
              <span className={`h-10 w-10 rounded-xl flex items-center justify-center font-semibold ${p.tone}`}>
                {p.mark}
              </span>
              <p className="mt-4 text-[15px] font-medium text-ink-900">{p.name}</p>
              <p className="mt-1 text-[13px] text-ink-600">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
