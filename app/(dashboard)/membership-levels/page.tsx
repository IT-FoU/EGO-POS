import { cookies } from "next/headers";
import { MembershipLevelsClient } from "@/features/membership-levels/components/membership-levels-client";
import { getMembershipLevels } from "@/features/membership-levels/membership-level-service";
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

  return <MembershipLevelsClient levels={levels} locale={locale} />;
}
