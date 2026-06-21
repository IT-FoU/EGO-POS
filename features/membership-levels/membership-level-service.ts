import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaMembershipLevels } from "@/features/membership-levels/prisma-repository";

export async function getMembershipLevels() {
  return getPrismaMembershipLevels(tenantFromSession(await requireSession()));
}
