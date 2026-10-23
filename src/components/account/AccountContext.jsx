"use client";

import { createContext, useContext, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatMoney, currencySymbol } from "@/lib/meta/money";

const AccountContext = createContext(null);

export function AccountProvider({ accounts, children }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get("account");

  const account = useMemo(() => {
    if (!accounts?.length) return null;
    return (
      accounts.find((a) => a.id === requestedId) ||
      accounts[0]
    );
  }, [accounts, requestedId]);

  const setAccount = useCallback(
    (id) => {
      const next = new URLSearchParams(params.toString());
      next.set("account", id);
      // IDs don't translate across accounts — clear compare selection.
      next.delete("compare");
      // Range / since / until DO translate fine — preserve them.
      const qs = next.toString();
      router.push(qs ? `/meta?${qs}` : "/meta");
    },
    [router, params],
  );

  const value = useMemo(() => {
    const currency = account?.currency || "USD";
    return {
      accounts,
      account,
      accountId: account?.id || null,
      currency,
      symbol: currencySymbol(currency),
      setAccount,
      fmtMoney: (n, opts) => formatMoney(n, currency, opts),
    };
  }, [accounts, account, setAccount]);

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used inside AccountProvider");
  }
  return ctx;
}

export function useMoney() {
  return useAccount().fmtMoney;
}

export function useCurrency() {
  return useAccount().currency;
}

// Returns a function that builds an href preserving the current account,
// range, and any custom date params. Use this in place of bare path strings
// for every internal <Link>.
export function useAppHref() {
  const params = useSearchParams();
  const { accountId } = useAccount();

  return useMemo(() => {
    const range = params.get("range");
    const since = params.get("since");
    const until = params.get("until");
    return (path, extra = {}) => {
      const sp = new URLSearchParams();
      if (accountId) sp.set("account", accountId);
      if (range && range !== "maximum") sp.set("range", range);
      if (since) sp.set("since", since);
      if (until) sp.set("until", until);
      Object.entries(extra).forEach(([k, v]) => {
        if (v == null) sp.delete(k);
        else sp.set(k, String(v));
      });
      const qs = sp.toString();
      return qs ? `${path}?${qs}` : path;
    };
  }, [accountId, params]);
}
