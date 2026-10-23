// Split-screen shell for /login and /signup. Left: the form. Right: a dark
// hero with a product preview composed from real UI pieces (no images).

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/brand/Logo";
import { AuthHero } from "@/components/auth/AuthHero";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }) {
  if (await getCurrentUser()) redirect("/home");

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-ink-50">
      <div className="grain flex flex-col px-6 sm:px-12 py-8">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-sm mx-auto py-12">{children}</div>
        </div>
        <p className="text-xs text-ink-500">
          © {new Date().getFullYear()} Toosio · Read-only access to your ad accounts. We never change your campaigns.
        </p>
      </div>
      <AuthHero />
    </div>
  );
}
