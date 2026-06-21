import { getProducts } from "@/features/products/product-service";
import { createPrismaProduct } from "@/features/products/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return Response.json({ data: await getProducts(), ok: true });
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaProduct(body, tenant), request, WRITE_PERMISSIONS.productsCreate);
}
