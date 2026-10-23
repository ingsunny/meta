// GET  /api/tracker/settings  → returns the saved sheet URL
// POST /api/tracker/settings  → body { sheetUrl } persists it to the DB.
//
// Only updated on explicit save, so the value sticks across reloads /
// rebuilds and is shared between operators using the same install.

import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/tracker/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAppsScriptUrl(u) {
  if (!u) return false;
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

export async function GET() {
  const data = await readSettings();
  return NextResponse.json({ success: true, ...data });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  const sheetUrl = String(body?.sheetUrl || "").trim();
  if (sheetUrl && !isAppsScriptUrl(sheetUrl)) {
    return NextResponse.json(
      { success: false, error: "Only Apps Script URLs are allowed" },
      { status: 400 },
    );
  }
  const saved = await writeSettings({
    sheetUrl,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ success: true, ...saved });
}
