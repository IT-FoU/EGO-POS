import { ReportsAnalyticsClient } from "@/features/reports/components/reports-analytics-client";
import { getReportsSnapshot } from "@/features/reports/report-service";

export default async function ReportsPage() {
    const { hub } = await getReportsSnapshot();
    return <ReportsAnalyticsClient hub={hub} />;
}
