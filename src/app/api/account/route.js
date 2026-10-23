// PATCH /api/account — { name } or { currentPassword, newPassword }.

import { NextResponse } from "next/server";
import { changePassword, getCurrentUser, unauthorized, updateProfile } from "@/lib/auth/session";

export async function PATCH(req) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const error =
    body.newPassword !== undefined
      ? await changePassword(user.id, body.currentPassword, body.newPassword)
      : await updateProfile(user.id, body);

  if (error) return NextResponse.json({ success: false, error }, { status: 400 });
  return NextResponse.json({ success: true });
}
