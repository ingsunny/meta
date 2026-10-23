import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-500">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {item.href && !last ? (
              <Link
                href={item.href}
                className="hover:text-ink-800 transition-colors truncate"
              >
                {item.label}
              </Link>
            ) : (
              <span className={last ? "text-ink-800 font-medium truncate" : "truncate"}>
                {item.label}
              </span>
            )}
            {!last && <ChevronRight size={14} className="text-ink-300 shrink-0" />}
          </span>
        );
      })}
    </nav>
  );
}
