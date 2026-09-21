import { notFound } from "next/navigation";
import ProductReportView from "@/features/reports/components/product-report-view";
import { ReportCenterReusedPage, ReportCenterSkeletonPage } from "@/features/reports/components/report-center-detail-page";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";

export default async function ProductCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("products", report);
  if (!entry) notFound();
  if (entry.reuse === "products") {
    return (
      <ReportCenterReusedPage entry={entry}>
        <ProductReportView />
      </ReportCenterReusedPage>
    );
  }
  return <ReportCenterSkeletonPage entry={entry} />;
}
