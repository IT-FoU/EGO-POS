import { EgoPosCenterSectionPage } from "@/components/igo-admin/ego-pos-center";
import { getEgoPosCenterPageData } from "@/features/igo-admin/center-page-data";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditLogsPage() {
  await requireSuperAdminPortalAccess();
  return <EgoPosCenterSectionPage data={await getEgoPosCenterPageData()} section="audit" />;
}
