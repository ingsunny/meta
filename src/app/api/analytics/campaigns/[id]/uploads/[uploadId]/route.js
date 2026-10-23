// DELETE /api/analytics/campaigns/[id]/uploads/[uploadId]
//   Removes a single upload (and every event that arrived in it). The
//   rest of the campaign's data stays intact.
//
// PATCH  /api/analytics/campaigns/[id]/uploads/[uploadId]
//   body { enabled: boolean }
//   Toggles whether the upload's events count towards insights / match.
//   Events stay on disk either way — disabling is reversible.

import { NextResponse } from "next/server";
import {
  getCampaign,
  deleteUpload,
  setUploadEnabled,
} from "@/lib/analytics/storage";

export const runtime = "nodejs";

export async function DELETE(_req, { params }) {
  const { id, uploadId } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }
  const result = await deleteUpload(id, uploadId);
  return NextResponse.json({ success: true, ...result });
}

export async function PATCH(req, { params }) {
  const { id, uploadId } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Body must include enabled: boolean" },
      { status: 400 },
    );
  }

  // The "at least one upload must stay enabled" guard lives in the storage
  // layer (race-safe SQL count). It throws with code === "LAST_ENABLED"
  // which we surface as a friendly 409.
  try {
    const next = await setUploadEnabled(id, uploadId, body.enabled);
    return NextResponse.json({ success: true, campaign: next });
  } catch (e) {
    if (e?.code === "LAST_ENABLED") {
      return NextResponse.json(
        { success: false, error: e.message },
        { status: 409 },
      );
    }
    throw e;
  }
}
