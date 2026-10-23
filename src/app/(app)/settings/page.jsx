import { requireUser } from "@/lib/auth/session";
import { PageFrame } from "@/components/shell/PageFrame";
import { SettingsForms } from "@/components/settings/SettingsForms";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <PageFrame eyebrow="Workspace" title="Settings">
      <SettingsForms user={{ name: user.name, email: user.email, createdAt: user.created_at }} />
    </PageFrame>
  );
}
