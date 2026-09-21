import { notFound } from "next/navigation";
import ProductReportPage from "../page";
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
        <ProductReportPage />
      </ReportCenterReusedPage>
    );
  }
  return <ReportCenterSkeletonPage entry={entry} />;
}
