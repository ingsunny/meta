// Shown in Ads Manager when the user has no usable Meta connection —
// not connected, token expired, or the connection sees zero ad accounts.

import Link from "next/link";
import { ArrowRight, ShieldCheck, Eye, Layers } from "lucide-react";

export function ConnectMetaEmpty({ integration }) {
  const expired = integration && integration.status !== "active";
  const noAccounts = integration && integration.status === "active";

  const title = expired
    ? "Your Meta connection needs a refresh"
    : noAccounts
      ? "No ad accounts on this connection"
      : "Connect Meta to see your ads here";
  const body = expired
    ? "The access Meta gave us expired or was revoked. Reconnect and everything picks up where it left off."
    : noAccounts
      ? "The Meta profile you connected doesn't have access to any ad accounts yet. Add one in Meta Business Settings, then re-sync."
      : "Sign in with Facebook once and every ad account you have access to shows up here — campaigns, ad sets, ads, breakdowns and creative previews.";

  return (
    <div className="surface grain overflow-hidden">
      <div className="grid md:grid-cols-[1.2fr_1fr]">
        <div className="p-8 md:p-10">
          <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-600 max-w-md">{body}</p>
          <Link
            href="/integrations"
            className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-medium hover:bg-ink-800"
          >
            {integration ? "Manage connection" : "Connect Meta"}
            <ArrowRight size={15} />
          </Link>
        </div>
        <ul className="border-t md:border-t-0 md:border-l border-ink-200/70 bg-ink-50/60 p-8 md:p-10 space-y-5">
          {[
            [ShieldCheck, "Read-only", "We request ads_read only. Nothing in Meta can be changed from here."],
            [Layers, "Every account", "Personal and Business Manager accounts, switchable in one click."],
            [Eye, "Yours alone", "Your connection and data are private to your Toosio login."],
          ].map(([Icon, h, p]) => (
            <li key={h} className="flex gap-3">
              <span className="h-8 w-8 shrink-0 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Icon size={16} />
              </span>
              <div>
                <p className="text-sm font-medium text-ink-900">{h}</p>
                <p className="text-[13px] text-ink-600 leading-relaxed">{p}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
