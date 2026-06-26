import { getAdminSession } from "@/lib/admin/session";
import { provisionStore, type ProvisionStoreInput } from "@/lib/setup-admin/provision-store";
import type { CurrencyCode } from "@prisma/client";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: "Super admin authentication required.", ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ error: "Invalid request body.", ok: false }, { status: 400 });
  }

  const input: ProvisionStoreInput = {
    branchName: readString(body.branchName),
    businessTemplateKey: readString(body.businessTemplateKey),
    defaultCurrency: readString(body.defaultCurrency).toUpperCase() as CurrencyCode,
    defaultLocale: readString(body.defaultLocale),
    ownerEmail: readString(body.ownerEmail),
    ownerFullName: readString(body.ownerFullName),
    ownerTemporaryPassword: typeof body.ownerTemporaryPassword === "string" ? body.ownerTemporaryPassword : "",
    ownerUsername: readString(body.ownerUsername),
    storeCode: readString(body.storeCode),
    storeName: readString(body.storeName),
    warehouseName: readString(body.warehouseName),
  };

  const result = await provisionStore(input);

  if (!result.ok) {
    return Response.json({ error: result.error, ok: false }, { status: result.status });
  }

  return Response.json({
    branchId: result.branchId,
    businessTemplateKey: result.businessTemplateKey,
    companyId: result.companyId,
    loginUrl: result.loginUrl,
    ok: true,
    owner: {
      email: result.ownerEmail,
      temporaryPassword: result.ownerTemporaryPassword,
      username: result.ownerUsername,
    },
    store: {
      code: result.storeCode,
      name: result.storeName,
    },
    warehouseId: result.warehouseId,
  });
}
