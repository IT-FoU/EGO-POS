import type { MemberSearchPage } from "@/features/pos/member-search-repository";
import type { PosCustomer } from "@/features/pos/types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    if (response.status === 403) {
      throw new Error(
        typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "You do not have permission to perform this action.",
      );
    }
    const nested =
      typeof payload.error === "object" && payload.error && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message ?? "")
        : "";
    throw new Error(
      nested ||
        (typeof payload.error === "string" ? payload.error : "") ||
        (typeof payload.message === "string" ? payload.message : "") ||
        "Member search failed.",
    );
  }
  return payload.data as T;
}

/**
 * Live Member Search — reusable by More → Member Search and future Sale Options → Subscriber.
 */
export async function fetchMemberSearch(params: {
  limit?: number;
  search?: string;
} = {}): Promise<MemberSearchPage> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/pos/members/search${suffix}`);
  return readJson<MemberSearchPage>(response);
}

export async function fetchPosMemberById(customerId: string): Promise<PosCustomer | null> {
  const id = customerId.trim();
  if (!id) return null;
  const response = await fetch(`/api/pos/members/search?id=${encodeURIComponent(id)}`);
  const page = await readJson<MemberSearchPage & { member?: PosCustomer | null }>(response);
  if (page.member) return page.member;
  return page.results?.[0] ?? null;
}
