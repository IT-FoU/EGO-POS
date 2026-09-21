import { notFound } from "next/navigation";
import { ReportComingSoon } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";

export default async function ProductCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("products", report);
  if (!entry) notFound();
  return <ReportComingSoon entry={entry} />;
}
