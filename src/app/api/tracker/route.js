// /api/tracker?url=<apps-script-exec-url>
//
// Server-side proxy for the Apps Script Web app. Apps Script's /exec
// endpoint redirects to script.googleusercontent.com which does NOT set
// Access-Control-Allow-Origin, so a direct browser fetch fails CORS.
// We forward server-side (no CORS issues from Node), then return the
// JSON body to the dashboard.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAppsScript(u) {
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname.endsWith("script.google.com") ||
      parsed.hostname.endsWith("googleusercontent.com")
    );
  } catch {
    return false;
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { success: false, error: "Missing ?url parameter" },
      { status: 400 },
    );
  }
  if (!isAppsScript(target)) {
    return NextResponse.json(
      { success: false, error: "Only Apps Script URLs are allowed" },
      { status: 400 },
    );
  }
  // Forward any extra query params the dashboard sends (since/until/type/limit)
  const forward = new URL(target);
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "url") continue;
    forward.searchParams.set(k, v);
  }

  try {
    const r = await fetch(forward.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Apps Script returned ${r.status}`,
          body: text.slice(0, 500),
        },
        { status: 502 },
      );
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Apps Script did not return JSON",
          body: text.slice(0, 500),
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, ...json });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 502 },
    );
  }
}
