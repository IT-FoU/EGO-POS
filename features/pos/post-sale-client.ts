import {
  getPrismaSaleReceipt,
  listPrismaRecentSales,
  logPrismaReceiptReprint,
  refundPrismaSale,
  voidPrismaSale,
} from "@/features/pos/post-sale-repository";
import type { PosRecentSaleRecord, PosReceiptSnapshot, PostSaleMutationResult } from "@/features/pos/post-sale-types";

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

export async function voidSaleRequest(saleId: string, reason?: string) {
  const response = await fetch(`/api/pos/sales/${saleId}/void`, {
    body: JSON.stringify({ reason }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<PostSaleMutationResult>(response);
}

export async function refundSaleRequest(saleId: string, reason?: string) {
  const response = await fetch(`/api/pos/sales/${saleId}/refund`, {
    body: JSON.stringify({ reason }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return readJson<PostSaleMutationResult>(response);
}
