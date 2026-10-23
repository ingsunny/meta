"use client";

// Top-of-page pill that flips between the two product sections: Meta Ads
// analytics and the CSV-driven conversion analytics dashboard. Picks the
// active state from the current pathname so both layouts can share it.

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/meta", label: "Meta Ads", match: (p) => p.startsWith("/meta") },
  {
    href: "/analytics",
    label: "Analytics",
    match: (p) => p.startsWith("/analytics"),
  },
  {
    href: "/tracker",
    label: "Tracker",
    match: (p) => p.startsWith("/tracker"),
  },
  {
    href: "/journey",
    label: "Journey",
    match: (p) => p.startsWith("/journey"),
  },
  {
    href: "/capi",
    label: "CAPI",
    match: (p) => p.startsWith("/capi"),
  },
];

export function SectionSwitcher() {
  const pathname = usePathname() || "";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 p-0.5">
      {SECTIONS.map((s) => {
        const active = s.match(pathname);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`px-3 py-1 text-[11.5px] font-semibold rounded-full transition-colors whitespace-nowrap ${
              active
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-800"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
