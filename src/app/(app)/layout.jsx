// Authenticated product shell: fixed sidebar + content column. Every page
// under (app) requires a valid session.

import { requireUser } from "@/lib/auth/session";
import { getMetaIntegration } from "@/lib/integrations/meta";
import { Sidebar } from "@/components/shell/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const meta = await getMetaIntegration(user.id);

  return (
    <div className="min-h-screen bg-ink-50">
      <Sidebar
        user={{ name: user.name, email: user.email }}
        metaConnected={meta?.status === "active"}
      />
      <div className="lg:pl-60 min-w-0">{children}</div>
    </div>
  );
}
