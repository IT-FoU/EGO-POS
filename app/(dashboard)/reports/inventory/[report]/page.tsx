import { notFound } from "next/navigation";
import InventoryReportView from "@/features/reports/components/inventory-report-view";
import { ReportCenterReusedPage, ReportCenterSkeletonPage } from "@/features/reports/components/report-center-detail-page";
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
    return (
      <ReportCenterReusedPage entry={entry}>
        <InventoryReportView />
      </ReportCenterReusedPage>
    );
  }
  return <ReportCenterSkeletonPage entry={entry} />;
}
