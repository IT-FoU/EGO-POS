import { redirect } from "next/navigation";
import { mapLegacyIgoAdminPath } from "@/lib/super-admin/legacy-routes";

export default function LegacyIgoAdminSubscriptionsPage() {
  redirect(mapLegacyIgoAdminPath("/igo-admin/subscriptions"));
}
