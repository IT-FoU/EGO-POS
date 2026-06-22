import { getPrismaCategories, upsertPrismaCategory } from "@/features/products/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaCategories(tenant), READ_PERMISSIONS.productsView);
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => upsertPrismaCategory(body, tenant), request, WRITE_PERMISSIONS.categoriesManage);
}
