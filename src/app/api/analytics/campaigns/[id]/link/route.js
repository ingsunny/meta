// PUT    /api/analytics/campaigns/[id]/link
//        body { links: [{ accountId, campaignId, name, objective, currency, usdRate }, ...] }
//        (up to 3; older single-link callers can also pass top-level
//         accountId/campaignId and it gets coerced into a 1-item array)
// DELETE /api/analytics/campaigns/[id]/link  — clears all links

import { NextResponse } from "next/server";
import {
  getCampaign,
  setLinkedMetas,
  getLinkedMetas,
  MAX_LINKED_META,
} from "@/lib/analytics/storage";

export const runtime = "nodejs";

function normalizeLink(input, existingByCampaignId) {
  if (!input?.campaignId || !input?.accountId) return null;
  const existing = existingByCampaignId.get(input.campaignId) || {};
  return {
    accountId: input.accountId,
    campaignId: input.campaignId,
    name: input.name || existing.name || input.campaignId,
    objective: input.objective ?? existing.objective ?? null,
    currency: input.currency ?? existing.currency ?? null,
    usdRate:
      input.usdRate != null && Number.isFinite(Number(input.usdRate))
        ? Number(input.usdRate)
        : (existing.usdRate ?? null),
    linkedAt: existing.linkedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function PUT(req, { params }) {
  const { id } = await params;
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

  // Accept either `{ links: [...] }` or the legacy single-link shape.
  const incoming = Array.isArray(body?.links)
    ? body.links
    : body?.campaignId
      ? [body]
      : [];

  if (incoming.length === 0) {
    return NextResponse.json(
      { success: false, error: "Provide at least one link with accountId + campaignId" },
      { status: 400 },
    );
  }
  if (incoming.length > MAX_LINKED_META) {
    return NextResponse.json(
      {
        success: false,
        error: `Up to ${MAX_LINKED_META} Meta campaigns can be linked at once`,
      },
      { status: 400 },
    );
  }

  const existing = new Map(
    getLinkedMetas(campaign).map((l) => [l.campaignId, l]),
  );
  const seen = new Set();
  const linkedMetas = [];
  for (const item of incoming) {
    const normalized = normalizeLink(item, existing);
    if (!normalized) continue;
    if (seen.has(normalized.campaignId)) continue;
    seen.add(normalized.campaignId);
    linkedMetas.push(normalized);
  }

  if (linkedMetas.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid links in body" },
      { status: 400 },
    );
  }

  const next = await setLinkedMetas(id, linkedMetas);
  return NextResponse.json({ success: true, campaign: next });
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const next = await setLinkedMetas(id, []);
  return NextResponse.json({ success: true, campaign: next });
}
