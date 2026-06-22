import { getPrismaProducts } from "@/features/products/prisma-repository";
import { createPrismaProduct } from "@/features/products/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaProducts(tenant), READ_PERMISSIONS.productsView);
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaProduct(body, tenant), request, WRITE_PERMISSIONS.productsCreate);
}
