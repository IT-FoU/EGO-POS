import { tReports } from "@/lib/i18n/reports-copy";

export default function OwnShiftHistoryLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="h-10 w-48 animate-pulse rounded-md bg-zinc-200" />
      <div className="h-16 animate-pulse rounded-md bg-zinc-200" />
      <section className="rounded-lg border border-border bg-white p-8 text-sm text-zinc-600">
        {tReports("loadingShiftTable")}
      </section>
    </div>
  );
}
