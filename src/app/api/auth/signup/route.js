// POST /api/auth/signup — { name, email, password } → creates the user and
// signs them in.

import { NextResponse } from "next/server";
import { createUser, findUserByEmail, startSession, validateSignup } from "@/lib/auth/session";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const error = validateSignup(body);
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });

  if (await findUserByEmail(body.email)) {
    return NextResponse.json(
      { success: false, error: "An account with this email already exists. Sign in instead." },
      { status: 409 },
    );
  }

  const user = await createUser(body);
  return startSession(NextResponse.json({ success: true, user }), user.id);
}
