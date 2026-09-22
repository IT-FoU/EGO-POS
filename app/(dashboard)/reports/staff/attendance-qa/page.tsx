import { AttendanceQaView } from "@/features/reports/components/attendance-qa-view";
import { getAttendanceQaLocale, getAttendanceQaPageData } from "@/features/attendance/attendance-qa-service";
import { tReports } from "@/lib/i18n/reports-copy";

export default async function AttendanceQaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getAttendanceQaLocale();
  const params = await searchParams;
  try {
    const data = await getAttendanceQaPageData(params);
    const pick = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
    return (
      <AttendanceQaView
        branches={data.branches}
        employees={data.employees}
        filters={{
          branchId: pick("branchId"),
          date: pick("date"),
          status: pick("status"),
          userId: pick("userId"),
        }}
        locale={locale}
        rows={data.rows}
      />
    );
  } catch {
    return <p className="p-6 text-sm">{tReports("emptyAttendanceQa", locale)}</p>;
  }
}
