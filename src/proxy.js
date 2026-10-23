// Auth proxy (renamed from middleware in Next 16). Cheap first gate: no
// session cookie → pages redirect to /login, APIs get a 401. The cookie is
// fully validated against the sessions table by `getCurrentUser()` in every
// layout and route handler, so a forged cookie gets no further than this.
//
// Matcher excludes Next internals and the large-file upload routes — the
// proxy buffers request bodies, which breaks big CSV/XLSX uploads. Those
// routes check the session themselves.

import { NextResponse } from "next/server";

const SESSION_COOKIE = "toosio_session";
const PUBLIC_PAGES = ["/login", "/signup"];

export function proxy(request) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PAGES.includes(pathname) || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + (search || ""))}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!api/analytics/campaigns/[^/]+/upload|api/reports/upload|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
