import type { Supplier, SupplierPayment, SupplierPurchaseOrder, SupplierReceiving } from "@/features/suppliers/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  getPrismaSupplierById,
  getPrismaSupplierDetail,
  getPrismaSuppliers,
  getPrismaSuppliersSnapshot,
} from "@/features/suppliers/prisma-repository";

export async function getSuppliersSnapshot(): Promise<{
  payments: SupplierPayment[];
  purchaseOrders: SupplierPurchaseOrder[];
  receivings: SupplierReceiving[];
  suppliers: Supplier[];
}> {
  return getPrismaSuppliersSnapshot(tenantFromSession(await requireSession()));
}

export async function getSuppliers(): Promise<Supplier[]> {
  return getPrismaSuppliers(tenantFromSession(await requireSession()));
}

export async function getSupplierById(supplierId: string): Promise<Supplier | undefined> {
  return getPrismaSupplierById(supplierId, tenantFromSession(await requireSession()));
}

export async function getSupplierDetail(supplierId: string): Promise<{
  payments: SupplierPayment[];
  purchaseOrders: SupplierPurchaseOrder[];
  receivings: SupplierReceiving[];
  supplier: Supplier | undefined;
}> {
  return getPrismaSupplierDetail(supplierId, tenantFromSession(await requireSession()));
}
