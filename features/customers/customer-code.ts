export const CUSTOMER_CODE_PREFIX = "MEM-";
export const CUSTOMER_CODE_RETRY_LIMIT = 8;

export function customerCodeLockKey(companyId: string): string {
  return `customer-code:${companyId}`;
}

export function parseCustomerCodeSequence(code: string | null | undefined): number {
  const raw = String(code ?? "");
  if (!raw.startsWith(CUSTOMER_CODE_PREFIX)) {
    return 0;
  }
  const parsed = Number(raw.slice(CUSTOMER_CODE_PREFIX.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatCustomerCode(sequence: number): string {
  return `${CUSTOMER_CODE_PREFIX}${String(sequence).padStart(6, "0")}`;
}

export function nextCustomerCode(existingCodes: Array<string | null | undefined>): string {
  let max = 0;
  for (const code of existingCodes) {
    const parsed = parseCustomerCodeSequence(code);
    if (parsed > max) {
      max = parsed;
    }
  }
  return formatCustomerCode(max + 1);
}

export function isCustomerCodeUniqueCollision(error: unknown): boolean {
  const err = error as { code?: string; meta?: { target?: unknown }; message?: string } | null;
  const message = String(err?.message ?? error ?? "");
  const target = err?.meta?.target;
  const targetText = Array.isArray(target) ? target.join(".") : String(target ?? "");
  const haystack = `${targetText} ${message}`;
  const mentionsCode = /customer[_]?code/i.test(haystack);
  if (err?.code === "P2002" && mentionsCode) {
    return true;
  }
  return /unique constraint/i.test(message) && mentionsCode;
}
