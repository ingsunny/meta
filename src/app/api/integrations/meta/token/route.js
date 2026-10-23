// POST /api/integrations/meta/token — { token } → connect Meta with a
// pasted user/system-user access token (dev, or before App Review).

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { connectMeta, graphErrorMessage } from "@/lib/integrations/meta";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { token } = await req.json().catch(() => ({}));
  const clean = String(token || "").trim();
  if (clean.length < 20) {
    return NextResponse.json({ success: false, error: "Paste a full Meta access token." }, { status: 400 });
  }

  try {
    const integration = await connectMeta(user.id, { token: clean, method: "token" });
    return NextResponse.json({ success: true, accounts: integration.accounts.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: graphErrorMessage(e) }, { status: 400 });
  }
}
