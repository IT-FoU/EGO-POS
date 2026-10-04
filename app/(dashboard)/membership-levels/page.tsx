import { cookies } from "next/headers";
import { allowsPermission } from "@/features/access-control/phase3-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { MembershipLevelsClient } from "@/features/membership-levels/components/membership-levels-client";
import { getMembershipLevels } from "@/features/membership-levels/membership-level-service";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function MembershipLevelsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  if (isNextProductionBuildPhase()) {
    return <MembershipLevelsClient levels={[]} locale={locale} />;
  }

  const levels = await getMembershipLevels();
  const keys = await getUserPermissionKeys(tenantFromSession(await requireSession()));
  const access = {
    archive: allowsPermission(keys, "membership.delete"),
    create: allowsPermission(keys, "membership.create"),
    edit: allowsPermission(keys, "membership.edit"),
  };

  return <MembershipLevelsClient access={access} levels={levels} locale={locale} />;
}
