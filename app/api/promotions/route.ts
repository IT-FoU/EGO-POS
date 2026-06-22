import { getPrismaPromotions, createPrismaPromotion } from "@/features/promotions/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaPromotions(tenant), READ_PERMISSIONS.promotionsView);
}

export async function POST(request: Request) {
  return runWrite((tenant, body) => createPrismaPromotion(body, tenant), request, WRITE_PERMISSIONS.promotionsCreate);
}
