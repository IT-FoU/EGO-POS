import type { HeldBillCartSnapshot, HeldSale } from "@/features/pos/types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? payload.error ?? payload.message ?? "Held bill request failed.");
  }
  return payload.data as T;
}

export async function fetchHeldBills() {
  return readJson<HeldSale[]>(await fetch("/api/pos/held-bills", { cache: "no-store" }));
}

export async function createHeldBill(snapshot: HeldBillCartSnapshot, cashSessionId?: string | null) {
  return readJson<HeldSale>(await fetch("/api/pos/held-bills", {
    body: JSON.stringify({ cashSessionId, snapshot }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }));
}

export async function resumeHeldBill(heldBillId: string) {
  return readJson<{ availabilityWarnings: string[]; sale: HeldSale }>(await fetch(`/api/pos/held-bills/${heldBillId}/resume`, {
    method: "POST",
  }));
}

export async function cancelHeldBill(heldBillId: string, reason?: string) {
  return readJson<{ heldBillId: string; status: "cancelled" }>(await fetch(`/api/pos/held-bills/${heldBillId}/cancel`, {
    body: JSON.stringify({ reason }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }));
}
