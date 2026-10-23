// Shell for the /analytics section — conversion CSVs, scoped to the
// signed-in user. Pages render their own headers.

import { PageFrame } from "@/components/shell/PageFrame";

export const metadata = {
  title: "Analytics",
};

export const dynamic = "force-dynamic";

export default function AnalyticsLayout({ children }) {
  return <PageFrame>{children}</PageFrame>;
}
