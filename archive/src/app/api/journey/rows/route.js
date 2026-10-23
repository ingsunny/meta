// GET /api/journey/rows?search=&status=&offer=&country=&device=&matched=&sort=&dir=&limit=&offset=
// One row per click + an aggregate summary of its conversion events.

import { NextResponse } from "next/server";
import { getRows } from "@/lib/journey/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const result = await getRows({
    filters: {
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "",
      offer: searchParams.get("offer") || "",
      country: searchParams.get("country") || "",
      device: searchParams.get("device") || "",
      matched: searchParams.get("matched") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    },
    sort: searchParams.get("sort") || "session_time",
    dir: searchParams.get("dir") || "desc",
    limit: Number(searchParams.get("limit") || 100),
    offset: Number(searchParams.get("offset") || 0),
  });
  return NextResponse.json({ success: true, ...result });
}
