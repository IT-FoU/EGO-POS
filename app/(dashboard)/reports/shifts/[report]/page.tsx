import { notFound } from "next/navigation";
import { ReportCenterSkeletonPage } from "@/features/reports/components/report-center-detail-page";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";

export default async function ShiftCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("shifts", report);
  if (!entry) notFound();
  return <ReportCenterSkeletonPage entry={entry} />;
}
