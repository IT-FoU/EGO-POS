import { getReportsSnapshot } from "@/features/reports/report-service";

export async function GET() {
  return Response.json({ data: await getReportsSnapshot(), ok: true });
}
