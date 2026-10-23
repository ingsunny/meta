// GET    /api/reports/[id] — report + all rows
// PATCH  /api/reports/[id] — { name } rename
// DELETE /api/reports/[id]

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { deleteReport, getReport, getReportRows, renameReport } from "@/lib/reports/storage";

const notFound = () => NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });

export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const report = await getReport(user.id, id);
  if (!report) return notFound();
  return NextResponse.json({ success: true, report, rows: await getReportRows(id) });
}

export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const { name } = await req.json().catch(() => ({}));
  if (!String(name || "").trim()) {
    return NextResponse.json({ success: false, error: "Name can't be empty." }, { status: 400 });
  }
  return (await renameReport(user.id, id, String(name).trim())) ? NextResponse.json({ success: true }) : notFound();
}

export async function DELETE(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  return (await deleteReport(user.id, id)) ? NextResponse.json({ success: true }) : notFound();
}
