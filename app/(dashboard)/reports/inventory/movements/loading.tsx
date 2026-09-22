import { ReportSheet } from "@/features/reports/components/report-page-shell";

export default function StockMovementLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ReportSheet>
        <div className="px-6 py-16 text-center text-sm text-zinc-500 sm:px-8">Loading stock movement report…</div>
      </ReportSheet>
    </div>
  );
}
