// POST /api/analytics/campaigns/[id]/upload — accepts a CSV file (multipart
// form field `csv`), parses it, dedups by conversion_id, appends to the
// campaign's events file, and returns counts so the UI can show
// "added X, Y duplicates skipped".

import { NextResponse } from "next/server";
import { getCampaign, appendEvents } from "@/lib/analytics/storage";
import { csvToObjects } from "@/lib/analytics/csv";

// Disable Next's request-body size cap so daily exports of any reasonable
// size go through without surprise 413s. The route still runs server-side
// and parses everything in-process.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Big daily CSVs can take a while to parse + dedupe. Bump from the default
// so a 50–100MB export doesn't timeout mid-import.
export const maxDuration = 300;

export async function POST(req, { params }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("csv");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { success: false, error: "Attach the CSV under field name 'csv'" },
      { status: 400 },
    );
  }

  let text;
  try {
    text = await file.text();
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message || "Couldn't read the file" },
      { status: 400 },
    );
  }

  const { headers, records } = csvToObjects(text);

  if (!headers.includes("conversion_id")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "CSV missing required 'conversion_id' column — is this the right export?",
      },
      { status: 400 },
    );
  }

  if (records.length === 0) {
    return NextResponse.json(
      { success: false, error: "CSV had no data rows" },
      { status: 400 },
    );
  }

  const result = await appendEvents(id, records, {
    filename: file.name || "upload.csv",
  });
  return NextResponse.json({
    success: true,
    filename: file.name || "upload.csv",
    rowsRead: records.length,
    ...result,
  });
}
