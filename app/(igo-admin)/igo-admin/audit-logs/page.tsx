import { redirect } from "next/navigation";
import { mapLegacyIgoAdminPath } from "@/lib/super-admin/legacy-routes";

export default function LegacyIgoAdminAuditLogsPage() {
  redirect(mapLegacyIgoAdminPath("/igo-admin/audit-logs"));
}
