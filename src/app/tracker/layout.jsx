// Shell layout for the /tracker section. Mirrors the Analytics layout shell
// but uses a blue accent so the two sections are visually distinct.

import Link from "next/link";
import { SectionSwitcher } from "@/components/layout/SectionSwitcher";

export const metadata = {
  title: "Tracker · Live Landing-Page Events",
};

export const dynamic = "force-dynamic";

export default function TrackerLayout({ children }) {
  return (
    <div className="min-h-screen bg-ink-100">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 lg:px-8 h-16">
          <div className="flex items-center gap-3">
            <Link href="/tracker" className="flex items-center gap-2.5 group">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white font-bold text-base shadow-sm group-hover:bg-sky-600 transition-colors">
                K
              </span>
              <div className="leading-tight">
                <p className="text-[15px] font-bold text-ink-900 tracking-tight">
                  Tracker
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  Live landing events
                </p>
              </div>
            </Link>
            <span className="hidden md:inline-flex h-6 w-px bg-ink-200 mx-2" />
            <SectionSwitcher />
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-ink-600">sunny@appmontize.co.in</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-sky-400 to-sky-600 text-white font-semibold text-xs ring-2 ring-white shadow-sm">
              S
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">{children}</main>
    </div>
  );
}
