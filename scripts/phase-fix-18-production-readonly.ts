import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { classifyDatabaseUrl, fingerprintDatabaseUrl, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const COMPANY_ID = "cmtbbgreh003hakbhogifi599";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
if (classifyDatabaseUrl(url) !== "PRODUCTION" || fingerprintDatabaseUrl(url) !== PRODUCTION_DB_FINGERPRINT) {
  throw new Error("REFUSING: production-readonly is not Production");
}

const prisma = createScriptPrismaClient("production-readonly");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

const { computeCashSessionTotalsForShift } = await import("../features/cash-sessions/prisma-repository");

const session = await prisma.cashSession.findFirst({
  include: { transactions: true },
  orderBy: { openedAt: "desc" },
  where: { closedAt: null, companyId: COMPANY_ID },
});

const totals = session ? await computeCashSessionTotalsForShift(session) : null;
const cashInCount = session
  ? session.transactions.filter((row) => row.transactionType === "cash_in").length
  : 0;
const cashOutCount = session
  ? session.transactions.filter((row) => row.transactionType === "cash_out").length
  : 0;

const out = {
  fingerprint: PRODUCTION_DB_FINGERPRINT,
  sessionId: session?.id ?? null,
  sessionStatus: session ? "OPEN" : "NONE",
  expectedCashLak: totals?.expectedCashLak ?? null,
  cashInCount,
  cashOutCount,
  cashInLak: totals?.cashInLak ?? null,
  cashOutLak: totals?.cashOutLak ?? null,
  cashSalesLak: totals?.cashSalesLak ?? null,
  openingCashLak: session ? Number(session.openingCash) : null,
  productionCashMutation: 0,
  productionBusinessDataModified: "NO",
  writes: 0,
};

console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
