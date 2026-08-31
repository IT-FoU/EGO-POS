import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { classifyDatabaseUrl, fingerprintDatabaseUrl, PRODUCTION_DB_FINGERPRINT } from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
if (classifyDatabaseUrl(url) !== "PRODUCTION" || fingerprintDatabaseUrl(url) !== PRODUCTION_DB_FINGERPRINT) {
  throw new Error("REFUSING: production-readonly is not Production");
}

const prisma = createScriptPrismaClient("production-readonly");
const COMPANY_ID = "cmtbbgreh003hakbhogifi599";
const CUSTOMER_ID = "cmtgfv8s40001psp76xqcsd5j";

const [row, customers, members] = await Promise.all([
  prisma.customer.findFirst({
    select: {
      customerCode: true,
      fullName: true,
      id: true,
      membershipLevelId: true,
      pointsBalance: true,
      status: true,
    },
    where: { companyId: COMPANY_ID, id: CUSTOMER_ID },
  }),
  prisma.customer.count({ where: { companyId: COMPANY_ID } }),
  prisma.customer.count({ where: { companyId: COMPANY_ID, membershipLevelId: { not: null } } }),
]);

console.log(
  JSON.stringify(
    {
      customerCode: row?.customerCode ?? null,
      customers,
      exists: Boolean(row),
      fullName: row?.fullName ?? null,
      id: row?.id ?? null,
      members,
      membershipLevelId: row?.membershipLevelId ?? null,
      points: row?.pointsBalance ?? null,
      status: row?.status ?? null,
      writes: 0,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
