// Root: no landing page — signed-in users go to their home, everyone else
// to the login screen.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Root() {
  redirect((await getCurrentUser()) ? "/home" : "/login");
}
