import { getPrismaPosMemberById, searchPrismaMembers } from "@/features/pos/member-search-repository";
import { clampMemberSearchLimit } from "@/features/pos/member-search-query";
import { runRead } from "@/lib/api/write-response";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const search = url.searchParams.get("search") ?? url.searchParams.get("q") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? clampMemberSearchLimit(Number(url.searchParams.get("limit")))
    : undefined;

  return runRead(async (tenant) => {
    if (id?.trim()) {
      const member = await getPrismaPosMemberById(tenant, id.trim());
      return {
        limit: clampMemberSearchLimit(limit),
        member,
        query: id.trim(),
        results: member ? [member] : [],
      };
    }
    return searchPrismaMembers(tenant, { limit, search });
  });
}
