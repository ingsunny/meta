import { Suspense } from "react";
import { DateRangePicker } from "@/components/layout/DateRangePicker";
import { AccountProvider } from "@/components/account/AccountContext";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { PageFrame } from "@/components/shell/PageFrame";
import { ConnectMetaEmpty } from "@/components/integrations/ConnectMetaEmpty";
import { getAccounts } from "@/lib/meta/accounts";
import { requireUser } from "@/lib/auth/session";
import { getMetaIntegration } from "@/lib/integrations/meta";

export const metadata = {
  title: "Ads Manager",
};

export const dynamic = "force-dynamic";

export default async function MetaLayout({ children }) {
  const user = await requireUser();
  const integration = await getMetaIntegration(user.id);
  const accounts = await getAccounts();

  if (!integration || integration.status !== "active" || accounts.length === 0) {
    return (
      <PageFrame eyebrow="Ads Manager" title="Your Meta ads, read-only">
        <ConnectMetaEmpty integration={integration} />
      </PageFrame>
    );
  }

  return (
    <Suspense>
      <AccountProvider accounts={accounts}>
        <PageFrame
          toolbar={
            <>
              <div className="flex items-center gap-3 min-w-0">
                <span className="hidden sm:inline text-[13px] font-medium text-ink-900">Ads Manager</span>
                <span className="hidden sm:inline h-4 w-px bg-ink-200" />
                <AccountSwitcher />
              </div>
              <DateRangePicker />
            </>
          }
        >
          {children}
        </PageFrame>
      </AccountProvider>
    </Suspense>
  );
}
