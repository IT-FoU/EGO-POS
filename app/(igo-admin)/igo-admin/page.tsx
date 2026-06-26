import { redirect } from "next/navigation";
import { mapLegacyIgoAdminPath } from "@/lib/super-admin/legacy-routes";

export default function LegacyIgoAdminPage() {
  redirect(mapLegacyIgoAdminPath("/igo-admin"));
}
