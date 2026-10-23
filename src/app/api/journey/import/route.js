// POST /api/journey/import
//
// Multipart/form-data upload of one or both reports. Either field is
// optional, so the user can refresh just paychat or just conv:
//   • fuse: paychat / Fuse Click Report CSV (times in IST)
//   • conv: offline conversion report CSV  (times in PST/PDT)
//
// The route auto-detects which kind a file is by sniffing its header row
// (so the labels are belt-and-suspenders — even if the user swaps them,
// we still ingest correctly). All timestamps are converted to UTC before
// being inserted so the unified timeline + Meta `event_time` are correct.
//
// UPSERT semantics: re-uploading the same CSV is safe / idempotent.
// Conv rows dedupe on `conversion_id`; Fuse rows on (transaction_id,
// session_time).

import { NextResponse } from "next/server";
import {
  toObjects,
  detectKind,
  importFuseRows,
  importConvRows,
} from "@/lib/journey/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Big conversion reports take a while to parse + insert.
export const maxDuration = 300;

async function handleFile(file, kindHint) {
  if (!file || typeof file === "string") return null;
  const text = await file.text();
  const { headers, records } = toObjects(text);
  const detected = detectKind(headers);
  const kind = detected || kindHint;
  if (!kind) {
    return {
      filename: file.name || "upload.csv",
      error:
        "Unrecognised CSV — header row didn't match the paychat (Fuse) or conv report format.",
    };
  }
  if (detected && kindHint && detected !== kindHint) {
    // The file was put in the wrong slot — still ingest it correctly
    // but flag it so the UI can show a warning.
    // (We honour `detected` over `kindHint` since the header is truth.)
  }
  if (kind === "fuse") {
    const inserted = await importFuseRows(records);
    return {
      kind: "fuse",
      filename: file.name || "fuse.csv",
      rowsRead: records.length,
      inserted,
      detected,
    };
  }
  if (kind === "conv") {
    const inserted = await importConvRows(records);
    return {
      kind: "conv",
      filename: file.name || "conv.csv",
      rowsRead: records.length,
      inserted,
      detected,
    };
  }
  return null;
}

export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }
  try {
    const fuseResult = await handleFile(form.get("fuse"), "fuse");
    const convResult = await handleFile(form.get("conv"), "conv");
    if (!fuseResult && !convResult) {
      return NextResponse.json(
        { success: false, error: "Attach `fuse` and/or `conv` CSV files." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      success: true,
      fuse: fuseResult,
      conv: convResult,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message || String(e) },
      { status: 500 },
    );
  }
}
