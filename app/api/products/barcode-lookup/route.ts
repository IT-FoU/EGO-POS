import { findPrismaProductByBarcode } from "@/features/products/prisma-repository";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const barcode = new URL(request.url).searchParams.get("barcode") ?? "";

  return runRead(
    (tenant) => findPrismaProductByBarcode(barcode, tenant),
    READ_PERMISSIONS.productsView,
  );
}
