import {
  getPrismaSaleReceipt,
  listPrismaRecentSales,
  logPrismaReceiptReprint,
  refundPrismaSale,
  voidPrismaSale,
} from "@/features/pos/post-sale-repository";
import type { PosRecentSaleRecord, PosReceiptSnapshot, PostSaleMutationResult } from "@/features/pos/post-sale-types";
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

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? payload.message ?? "Post-sale request failed.");
  }
  return payload.data as T;
}

export async function fetchRecentSales(search = ""): Promise<PosRecentSaleRecord[]> {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("search", search.trim());
  }
  const response = await fetch(`/api/pos/sales?${params.toString()}`);
  return readJson<PosRecentSaleRecord[]>(response);
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
