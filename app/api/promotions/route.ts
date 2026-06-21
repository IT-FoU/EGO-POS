import { getPromotions } from "@/features/promotions/promotion-service";
import { createPrismaPromotion } from "@/features/promotions/prisma-repository";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return Response.json({ data: await getPromotions(), ok: true });
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaPromotion(body, tenant), request, WRITE_PERMISSIONS.promotionsCreate);
}
