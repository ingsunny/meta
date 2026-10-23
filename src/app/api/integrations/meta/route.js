// DELETE /api/integrations/meta — disconnect and forget the stored token.

import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/session";
import { disconnectMeta } from "@/lib/integrations/meta";

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  await disconnectMeta(user.id);
  return NextResponse.json({ success: true });
}
