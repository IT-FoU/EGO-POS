import { prisma } from "@/lib/db/prisma";

export const SETUP_ADMIN_MIGRATION_GUIDANCE =
  "EGO Admin is not ready on this environment. Run: npx prisma migrate deploy && npm run db:seed:demo";

export async function isSetupAdminTableReady() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM setup_admins LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function getSetupAdminMigrationStatus() {
  const ready = await isSetupAdminTableReady();
  return {
    guidance: SETUP_ADMIN_MIGRATION_GUIDANCE,
    ready,
  };
}
