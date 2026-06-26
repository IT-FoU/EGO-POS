import { prisma } from "@/lib/db/prisma";

export const STORE_PROVISIONING_MIGRATION_GUIDANCE =
  "Store provisioning schema is not ready. Run: npx prisma migrate deploy && npm run db:seed:demo";

export async function isStoreProvisioningSchemaReady() {
  try {
    await prisma.$queryRaw`SELECT store_code, business_template_key FROM companies LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}
