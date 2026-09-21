import type { ReactNode } from "react";
import { PaymentMethodsReport } from "@/features/reports/components/payment-methods-report";
import { ReportComingSoon, ReportPageChrome } from "@/features/reports/components/report-page-shell";
import type { ReportCenterEntry } from "@/features/reports/report-center-catalog";

export function ReportCenterSkeletonPage({ entry }: { entry: ReportCenterEntry }) {
  return <ReportComingSoon entry={entry} />;
}

export function ReportCenterReusedPage({
  children,
  entry,
}: {
  children: ReactNode;
  entry: ReportCenterEntry;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ReportPageChrome entry={entry} />
      {children}
    </div>
  );
}

export function ReportCenterPaymentMethodsPage({ entry }: { entry: ReportCenterEntry }) {
  return (
    <ReportCenterReusedPage entry={entry}>
      <PaymentMethodsReport />
    </ReportCenterReusedPage>
  );
}
