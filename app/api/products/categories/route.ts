import { getCategories } from "@/features/products/product-service";
import { upsertPrismaCategory } from "@/features/products/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return Response.json({ data: await getCategories(), ok: true });
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => upsertPrismaCategory(body, tenant), request, WRITE_PERMISSIONS.categoriesManage);
}
