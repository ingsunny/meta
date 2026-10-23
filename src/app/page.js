import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";

const workspaces = [
  {
    id: "meta",
    name: "Meta Ads",
    description:
      "Explore campaign, ad set, and ad performance. Compare side-by-side, surface anomalies, and decide what to scale.",
  },
];

export default function GatewayPage() {
  return (
    <div className="min-h-screen bg-ink-100 flex items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <div className="mb-10">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white font-bold text-base shadow-sm mb-5">
            M
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-2">
            Workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink-900">
            Welcome back, Sunny.
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Pick a workspace to enter its analytics view.
          </p>
        </div>

        <div className="space-y-3">
          {workspaces.map((w) => (
            <Link
              key={w.id}
              href={`/${w.id}`}
              className="group block surface hover:surface-lift transition-all p-5"
            >
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  <BarChart3 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-ink-900">
                    {w.name}
                  </p>
                  <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                    {w.description}
                  </p>
                </div>
                <ArrowRight
                  size={18}
                  className="mt-2 text-ink-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
