// POST /api/reports/upload — multipart `file` (+ optional `name`). Parses
// the sheet, detects columns, stores the report. Excluded from the auth
// proxy (body buffering), so the session is checked here.

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { parseReportFile, summarize } from "@/lib/reports/parse";
import { createReport } from "@/lib/reports/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Couldn't read the upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ success: false, error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Files up to 50 MB are supported." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { columns, rows } = await parseReportFile(buffer, file.name);
    const summary = summarize(columns, rows);
    const name =
      String(form.get("name") || "").trim() ||
      file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() ||
      "Untitled report";
    const id = await createReport(user.id, { name, filename: file.name, columns, rows, summary });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message || "Couldn't parse that file." }, { status: 400 });
  }
}
