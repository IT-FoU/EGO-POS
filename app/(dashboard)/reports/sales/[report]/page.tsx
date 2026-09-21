import { notFound } from "next/navigation";
import SalesReportView from "@/features/reports/components/sales-report-view";
import {
  ReportCenterPaymentMethodsPage,
  ReportCenterReusedPage,
  ReportCenterSkeletonPage,
} from "@/features/reports/components/report-center-detail-page";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";

export default async function SalesCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("sales", report);
  if (!entry) notFound();
  if (entry.reuse === "sales") {
    return (
      <ReportCenterReusedPage entry={entry}>
        <SalesReportView />
      </ReportCenterReusedPage>
    );
  }
  if (entry.reuse === "payment-methods") {
    return <ReportCenterPaymentMethodsPage entry={entry} />;
  }
  return <ReportCenterSkeletonPage entry={entry} />;
}
