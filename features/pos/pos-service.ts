import { getPrismaPosSnapshot } from "@/features/pos/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function getPosSnapshot() {
  const session = await requireSession();
  const snapshot = await getPrismaPosSnapshot(tenantFromSession(session));

  return {
    ...snapshot,
    cashierName: session.user.name ?? session.user.username ?? snapshot.cashierName,
  };
}
