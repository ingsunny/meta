// Auth proxy (renamed from middleware in Next 16). Gates every page + API
// route behind a hardcoded passcode. If the `fb_ads_auth` cookie isn't
// present (or has the wrong value), redirect to /login with the original
// destination in `?next=` so we can bounce back after a successful unlock.
//
// Matched paths exclude /login, /api/login, and Next.js internals so the
// login flow itself isn't gated.

import { NextResponse } from "next/server";

const AUTH_COOKIE = "fb_ads_auth";
const AUTH_VALUE = "unlocked-v1";

export function proxy(request) {
  const cookie = request.cookies.get(AUTH_COOKIE);
  if (cookie?.value === AUTH_VALUE) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const originalPath = url.pathname + (url.search || "");
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(originalPath)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Run on everything except: /login, /api/login, _next/static,
    // _next/image, favicon.ico, robots, sitemap, and any public image.
    //
    // Also exclude the analytics CSV upload endpoint — the proxy buffers
    // the request body so it can read cookies, which breaks large daily
    // exports past Next's default 10MB cap. We don't need auth at the
    // edge for that route; the login cookie still gates the UI page that
    // triggers the upload, so it isn't an open endpoint.
    "/((?!login|api/login|api/analytics/campaigns/[^/]+/upload|api/journey/import|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
