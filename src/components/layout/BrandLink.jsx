"use client";

import Link from "next/link";
import { useAppHref } from "@/components/account/AccountContext";

export function BrandLink() {
  const appHref = useAppHref();
  return (
    <Link href={appHref("/meta")} className="flex items-center gap-2.5 group">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white font-bold text-base shadow-sm group-hover:bg-brand-600 transition-colors">
        M
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-bold text-ink-900 tracking-tight">
          Meta Ads
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Analytics
        </p>
      </div>
    </Link>
  );
}
