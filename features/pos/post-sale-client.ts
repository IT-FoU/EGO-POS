import type { PosRecentSaleRecord, PosRecentSalesPage, PosReceiptSnapshot, PostSaleMutationResult } from "@/features/pos/post-sale-types";
import type { RecentSalesDatePreset } from "@/features/pos/recent-sales-query";
import type {
  ExchangeSaleInput,
  ReturnMutationResult,
  ReturnReceiptSnapshot,
  ReturnSaleInput,
  ReturnableSaleSnapshot,
} from "@/features/pos/return-types";

export type PostSaleManagerApprovalPayload = {
  managerPin: string;
  reason: string;
};

export type FetchRecentSalesParams = {
  cursor?: string | null;
  customEnd?: string;
  customStart?: string;
  datePreset?: RecentSalesDatePreset;
  limit?: number;
  search?: string;
};

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
        "Post-sale request failed.",
    );
  }
  return payload.data as T;
}

export async function fetchRecentSales(params: FetchRecentSalesParams | string = {}): Promise<PosRecentSalesPage> {
  const normalized: FetchRecentSalesParams =
    typeof params === "string" ? { search: params } : params ?? {};
  const query = new URLSearchParams();
  if (normalized.search?.trim()) {
    query.set("search", normalized.search.trim());
  }
  if (normalized.cursor) {
    query.set("cursor", normalized.cursor);
  }
  if (normalized.limit) {
    query.set("limit", String(normalized.limit));
  }
  if (normalized.datePreset) {
    query.set("datePreset", normalized.datePreset);
  }
  if (normalized.customStart?.trim()) {
    query.set("dateFrom", normalized.customStart.trim());
  }
  if (normalized.customEnd?.trim()) {
    query.set("dateTo", normalized.customEnd.trim());
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/pos/sales${suffix}`);
  return readJson<PosRecentSalesPage>(response);
}

export async function fetchSaleDetail(saleId: string): Promise<PosRecentSaleRecord> {
  const response = await fetch(`/api/pos/sales/${saleId}`);
  return readJson<PosRecentSaleRecord>(response);
}

export async function fetchSaleReceipt(saleId: string): Promise<PosReceiptSnapshot> {
  const response = await fetch(`/api/pos/sales/${saleId}/receipt`);
  return readJson<PosReceiptSnapshot>(response);
}

export async function reprintSaleReceipt(saleId: string) {
  const response = await fetch(`/api/pos/sales/${saleId}/reprint`, { method: "POST" });
  return readJson<{ receiptNo: string; saleId: string; saleNo: string }>(response);
}

export async function voidSaleRequest(saleId: string, reason?: string, approval?: PostSaleManagerApprovalPayload) {
  const response = await fetch(`/api/pos/sales/${saleId}/void`, {
    body: JSON.stringify({ approval, reason }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<PostSaleMutationResult>(response);
}

export async function refundSaleRequest(saleId: string, reason?: string, approval?: PostSaleManagerApprovalPayload) {
  const response = await fetch(`/api/pos/sales/${saleId}/refund`, {
    body: JSON.stringify({ approval, reason }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<PostSaleMutationResult>(response);
}

export async function lookupReturnableSales(search = "", saleId = ""): Promise<ReturnableSaleSnapshot[]> {
  const params = new URLSearchParams();
  if (saleId) params.set("saleId", saleId);
  else if (search.trim()) params.set("search", search.trim());
  const response = await fetch(`/api/pos/sales/lookup?${params.toString()}`);
  return readJson<ReturnableSaleSnapshot[]>(response);
}

export async function lookupExchangeProducts(search: string) {
  const params = new URLSearchParams({ search });
  const response = await fetch(`/api/pos/products/lookup?${params.toString()}`);
  return readJson<Array<{
    id: string;
    nameEn: string;
    nameLo: string;
    sellingPriceLak: number;
    sku: string;
    unitId?: string;
    unitName?: string;
  }>>(response);
}

export async function returnSaleRequest(
  saleId: string,
  input: Omit<ReturnSaleInput, "saleId">,
  approval?: PostSaleManagerApprovalPayload,
) {
  const response = await fetch(`/api/pos/sales/${saleId}/return`, {
    body: JSON.stringify({ ...input, approval }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<ReturnMutationResult>(response);
}

export async function exchangeSaleRequest(
  saleId: string,
  input: Omit<ExchangeSaleInput, "saleId">,
  approval?: PostSaleManagerApprovalPayload,
) {
  const response = await fetch(`/api/pos/sales/${saleId}/exchange`, {
    body: JSON.stringify({ ...input, approval }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<ReturnMutationResult>(response);
}

export async function fetchReturnReceipt(refundId: string): Promise<ReturnReceiptSnapshot> {
  const response = await fetch(`/api/pos/returns/${refundId}/receipt`);
  return readJson<ReturnReceiptSnapshot>(response);
}
