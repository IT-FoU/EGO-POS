import { notFound, redirect } from "next/navigation";
import { ReportComingSoon } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";

export default async function InventoryCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("inventory", report);
  if (!entry) notFound();
  if (entry.reuse === "inventory") {
    redirect("/reports/inventory");
  }
  return <ReportComingSoon entry={entry} />;
}
