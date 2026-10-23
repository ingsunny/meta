// POST /api/integrations/meta/sync — re-fetch the ad accounts this
// connection can see.

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { graphErrorMessage, syncMetaAccounts } from "@/lib/integrations/meta";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  try {
    const integration = await syncMetaAccounts(user.id);
    if (!integration) return NextResponse.json({ success: false, error: "Meta isn't connected." }, { status: 404 });
    return NextResponse.json({ success: true, accounts: integration.accounts.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: graphErrorMessage(e) }, { status: 400 });
  }
}
