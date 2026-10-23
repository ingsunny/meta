import { DateRangePicker } from "@/components/layout/DateRangePicker";
import { BrandLink } from "@/components/layout/BrandLink";
import { SectionSwitcher } from "@/components/layout/SectionSwitcher";
import { AccountProvider } from "@/components/account/AccountContext";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { getAccounts } from "@/lib/meta/accounts";

export const metadata = {
  title: "Meta · Ads Analytics",
};

export const dynamic = "force-dynamic";

export default async function MetaLayout({ children }) {
  const accounts = await getAccounts();

  return (
    <AccountProvider accounts={accounts}>
      <div className="min-h-screen bg-ink-100">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 lg:px-8 h-16">
            <div className="flex items-center gap-3">
              <BrandLink />
              <span className="hidden md:inline-flex h-6 w-px bg-ink-200 mx-2" />
              <SectionSwitcher />
              <span className="hidden md:inline-flex h-6 w-px bg-ink-200 mx-2" />
              <AccountSwitcher />
            </div>
            <div className="flex items-center gap-3">
              <DateRangePicker />
              <span className="hidden md:inline-flex h-7 w-px bg-ink-200" />
              <div className="hidden md:flex items-center gap-2 text-xs">
                <span className="text-ink-600">sunny@appmontize.co.in</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-600 text-white font-semibold text-xs ring-2 ring-white shadow-sm">
                  S
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">{children}</main>
      </div>
    </AccountProvider>
  );
}
