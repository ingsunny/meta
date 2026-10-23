import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getReport, getReportRows } from "@/lib/reports/storage";
import { PageFrame } from "@/components/shell/PageFrame";
import { ReportView } from "@/components/reports/ReportView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const user = await requireUser();
  const report = await getReport(user.id, (await params).id);
  return { title: report?.name || "Report" };
}

export default async function ReportPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await getReport(user.id, id);
  if (!report) notFound();
  const rows = await getReportRows(id);

  return (
    <PageFrame wide>
      <ReportView report={JSON.parse(JSON.stringify(report))} rows={rows} />
    </PageFrame>
  );
}
