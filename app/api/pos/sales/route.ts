import { completePrismaSale } from "@/features/pos/prisma-repository";
import { listPrismaRecentSales } from "@/features/pos/post-sale-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
  return runRead((tenant) => listPrismaRecentSales(tenant, { limit, search }));
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => completePrismaSale(body, tenant), request, WRITE_PERMISSIONS.posSell);
}
