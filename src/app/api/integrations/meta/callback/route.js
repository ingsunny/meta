// GET /api/integrations/meta/callback — Facebook redirects here with
// ?code&state. Exchange for a long-lived token, store it, sync accounts.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { connectMeta, exchangeCode, graphErrorMessage } from "@/lib/integrations/meta";

export async function GET(req) {
  const url = new URL(req.url);
  const back = new URL("/integrations", req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const fail = (msg) => {
    back.searchParams.set("error", msg);
    const res = NextResponse.redirect(back);
    res.cookies.set("meta_oauth_state", "", { path: "/api/integrations/meta", maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") || "Facebook Login was cancelled.");
  }
  const expected = req.cookies.get("meta_oauth_state")?.value;
  if (!expected || expected !== url.searchParams.get("state")) {
    return fail("That sign-in link expired. Please try connecting again.");
  }

  try {
    const { token, expiresIn } = await exchangeCode(url.searchParams.get("code"));
    await connectMeta(user.id, { token, expiresIn, method: "oauth" });
  } catch (e) {
    return fail(graphErrorMessage(e));
  }

  back.searchParams.set("connected", "meta");
  const res = NextResponse.redirect(back);
  res.cookies.set("meta_oauth_state", "", { path: "/api/integrations/meta", maxAge: 0 });
  return res;
}
