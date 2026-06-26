import { redirect } from "next/navigation";
import { mapLegacyIgoAdminPath } from "@/lib/super-admin/legacy-routes";

export default function LegacyIgoAdminUsersPage() {
  redirect(mapLegacyIgoAdminPath("/igo-admin/users"));
}
