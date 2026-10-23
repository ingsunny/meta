// Server-only helpers for the signed-in user's Meta context: their access
// token and the ad accounts their connection can see. Replaces the old
// single FB_TOKEN / AD_ACCOUNT_ID env setup — every user brings their own.

import { cache } from "react";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMetaIntegration, getMetaTokenForUser } from "@/lib/integrations/meta";

export const getMetaToken = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getMetaTokenForUser(user.id);
});

export const getAccounts = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  const integration = await getMetaIntegration(user.id);
  if (!integration) return [];
  return integration.accounts.map((a) => ({
    id: a.id,
    name: a.name || a.id,
    currency: a.currency || "USD",
    timezone: a.timezone || null,
    business: a.business_name || null,
    status: a.account_status,
    active: a.account_status === 1,
    error: false,
  }));
});

// Validate the requested account belongs to this user. Falls back to their
// first active account, then their first account of any status.
export async function resolveAccountId(requested) {
  const accounts = await getAccounts();
  if (accounts.length === 0) return null;
  if (requested && accounts.some((a) => a.id === requested)) return requested;
  return (accounts.find((a) => a.active) || accounts[0]).id;
}

export function metaNotConnected() {
  return NextResponse.json(
    { success: false, error: "Connect your Meta account in Integrations to load this data.", code: "meta_not_connected" },
    { status: 409 },
  );
}
