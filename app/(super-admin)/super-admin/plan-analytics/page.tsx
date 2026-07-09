import { EgoPosCenterOperationalPage } from "@/components/igo-admin/ego-pos-center";
import { getEgoPosCenterPageData } from "@/features/igo-admin/center-page-data";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminPlanAnalyticsPage() {
  await requireSuperAdminPortalAccess();
  const data = await getEgoPosCenterPageData();
  return <EgoPosCenterOperationalPage data={data} section="planAnalytics" />;
}
