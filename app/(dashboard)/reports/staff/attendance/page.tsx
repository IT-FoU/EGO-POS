import { StaffAttendanceReportView } from "@/features/reports/components/attendance-report-view";
import { getAttendanceReportLocale, getAttendanceReportPageData } from "@/features/reports/attendance-report-service";

export default async function StaffAttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getAttendanceReportLocale();
  const params = await searchParams;
  try {
    const data = await getAttendanceReportPageData(params);
    return <StaffAttendanceReportView data={data} locale={locale} />;
  } catch {
    return <StaffAttendanceReportView error="load" locale={locale} />;
  }
}
