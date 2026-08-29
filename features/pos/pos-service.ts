import type { Session } from "next-auth";
import { getPrismaPosSnapshot } from "@/features/pos/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function getPosSnapshot(session?: Session) {
  const resolved = session ?? (await requireSession());
  const snapshot = await getPrismaPosSnapshot(tenantFromSession(resolved));
  const companyName = resolved.user.activeCompanyName ?? snapshot.companyName;

  return {
    ...snapshot,
    cashierName: resolved.user.name ?? resolved.user.username ?? snapshot.cashierName,
    companyName,
    receiptSettings: {
      ...snapshot.receiptSettings,
      companyName,
    },
  };
}
