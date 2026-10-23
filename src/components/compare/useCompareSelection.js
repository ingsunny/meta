"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useCallback } from "react";

const KEY = "compare";

export function useCompareSelection({ max = 3 } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const ids = useMemo(() => {
    const raw = params.get(KEY);
    if (!raw) return [];
    return raw.split(",").filter(Boolean).slice(0, max);
  }, [params, max]);

  const write = useCallback(
    (next) => {
      const sp = new URLSearchParams(params.toString());
      if (next.length === 0) sp.delete(KEY);
      else sp.set(KEY, next.join(","));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  const toggle = useCallback(
    (id) => {
      const next = ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length >= max
          ? ids
          : [...ids, id];
      write(next);
    },
    [ids, write, max],
  );

  const remove = useCallback((id) => write(ids.filter((x) => x !== id)), [ids, write]);
  const clear = useCallback(() => write([]), [write]);

  const isFull = ids.length >= max;

  return { ids, toggle, remove, clear, isFull, count: ids.length };
}
