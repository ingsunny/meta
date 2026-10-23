// Server-only helpers. Reads AD_ACCOUNT_ID from env (comma-separated for
// multiple accounts, single value still works) and fetches each account's
// metadata (name, currency, status) from Meta's Graph API.

import axios from "axios";
import { cache } from "react";

const API_VERSION = "v25.0";

export function getConfiguredAccountIds() {
  const raw = process.env.AD_ACCOUNT_ID || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const getAccounts = cache(async () => {
  const ids = getConfiguredAccountIds();
  const token = process.env.FB_TOKEN;
  if (!token || ids.length === 0) return [];

  const results = await Promise.allSettled(
    ids.map((id) =>
      axios
        .get(`https://graph.facebook.com/${API_VERSION}/${id}`, {
          params: {
            fields: "id,name,currency,account_status,timezone_name",
            access_token: token,
          },
        })
        .then((r) => r.data),
    ),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return {
        id: r.value.id,
        name: r.value.name || ids[i],
        currency: r.value.currency || "USD",
        timezone: r.value.timezone_name || null,
        active: r.value.account_status === 1,
        error: false,
      };
    }
    return {
      id: ids[i],
      name: ids[i],
      currency: "USD",
      timezone: null,
      active: false,
      error: true,
    };
  });
});

// Validate the requested account is one we serve. Returns the account id,
// or the first configured one as fallback.
export function resolveAccountId(requested) {
  const ids = getConfiguredAccountIds();
  if (ids.length === 0) return null;
  if (!requested) return ids[0];
  return ids.includes(requested) ? requested : ids[0];
}
