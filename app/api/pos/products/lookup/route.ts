import { lookupPrismaExchangeProducts } from "@/features/pos/return-repository";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("search") ?? new URL(request.url).searchParams.get("q") ?? "";
  return runRead((tenant) => lookupPrismaExchangeProducts(tenant, search));
}
