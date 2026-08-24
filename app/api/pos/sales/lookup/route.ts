import { getPrismaReturnableSale, lookupPrismaReturnableSale } from "@/features/pos/return-repository";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const saleId = url.searchParams.get("saleId") ?? "";
  const search = url.searchParams.get("search") ?? url.searchParams.get("q") ?? "";

  return runRead(async (tenant) => {
    if (saleId) {
      const sale = await getPrismaReturnableSale(tenant, saleId);
      return sale ? [sale] : [];
    }
    return lookupPrismaReturnableSale(tenant, search);
  });
}
