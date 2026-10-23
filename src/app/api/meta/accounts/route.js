import { NextResponse } from "next/server";
import { getAccounts } from "@/lib/meta/accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await getAccounts();
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("Accounts fetch error:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Failed to load ad accounts" },
      { status: 500 },
    );
  }
}
