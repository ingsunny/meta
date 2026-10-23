const LOCALE = "en-IN";

// Locale-aware money formatter. `currency` is an ISO-4217 code like "INR",
// "USD". Intl.NumberFormat picks the right symbol + grouping for the locale
// (e.g. ₹1,18,023.45 vs $1,180.23). By default no rounding is applied — the
// exact value Meta returned is preserved (Meta typically returns up to 2dp
// for spend, but ratios like CPC/CPM can carry many more decimals).
export function formatMoney(amount, currency = "USD", { decimals } = {}) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    const opts = {
      style: "currency",
      currency,
    };
    if (decimals != null) {
      opts.minimumFractionDigits = decimals;
      opts.maximumFractionDigits = decimals;
    } else {
      opts.maximumFractionDigits = 2;
    }
    return new Intl.NumberFormat(LOCALE, opts).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}`;
  }
}

export function currencySymbol(currency = "USD") {
  try {
    const parts = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || currency;
  } catch {
    return currency;
  }
}
