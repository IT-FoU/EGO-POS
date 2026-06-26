import { redirect } from "next/navigation";
import { mapLegacyIgoAdminPath } from "@/lib/super-admin/legacy-routes";

export default function LegacyIgoAdminBusinessesPage() {
  redirect(mapLegacyIgoAdminPath("/igo-admin/businesses"));
}
