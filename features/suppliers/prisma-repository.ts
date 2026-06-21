import { prisma } from "@/lib/db/prisma";
import type { SupplierPayment, SupplierPurchaseOrder, SupplierReceiving } from "@/features/suppliers/types";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import {
  mapPrismaSupplier,
  mapPrismaSupplierPayment,
  mapPrismaSupplierPurchaseOrder,
  mapPrismaSupplierReceiving,
} from "@/features/suppliers/dto-mapper";
import {
  parseSupplierCreateInput,
  parseSupplierUpdateInput,
  type SupplierCreateInput,
  type SupplierUpdateInput,
} from "@/features/suppliers/dto";

const db = prisma as any;

export async function getPrismaSuppliersSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const [suppliers, purchaseOrders, receivings, payments] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" }, where: { companyId: scope.companyId, ...branchWhere } }),
    db.purchase.findMany({
      include: { warehouse: true },
      orderBy: { purchaseDate: "desc" },
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
    db.goodsReceipt.findMany({
      include: { items: true, purchase: true, warehouse: true },
      orderBy: { receivedAt: "desc" },
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
    db.purchasePayment.findMany({
      include: { purchase: true },
      orderBy: { paymentDate: "desc" },
      where: { purchase: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } } },
    }),
  ]);

  return {
    payments: payments.map(mapPrismaSupplierPayment),
    purchaseOrders: purchaseOrders.map(mapPrismaSupplierPurchaseOrder),
    receivings: receivings.map(mapPrismaSupplierReceiving),
    suppliers: suppliers.map(mapPrismaSupplier),
  };
}

export async function getPrismaSuppliers(tenant: TenantContext) {
  const { suppliers } = await getPrismaSuppliersSnapshot(tenant);
  return suppliers;
}

export async function getPrismaSupplierById(supplierId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const supplier = await db.supplier.findFirst({
    where: { companyId: scope.companyId, id: supplierId, ...branchOwnedWhere(scope) },
  });
  return supplier ? mapPrismaSupplier(supplier) : undefined;
}

export async function getPrismaSupplierDetail(supplierId: string, tenant: TenantContext) {
  const [snapshot, supplier] = await Promise.all([
    getPrismaSuppliersSnapshot(tenant),
    getPrismaSupplierById(supplierId, tenant),
  ]);

  return {
    payments: snapshot.payments.filter((payment: SupplierPayment) => payment.supplierId === supplierId),
    purchaseOrders: snapshot.purchaseOrders.filter((order: SupplierPurchaseOrder) => order.supplierId === supplierId),
    receivings: snapshot.receivings.filter((receiving: SupplierReceiving) => receiving.supplierId === supplierId),
    supplier,
  };
}

export async function createPrismaSupplier(input: SupplierCreateInput, tenant: TenantContext) {
  const data = parseSupplierCreateInput(input);
  return withTenantTransaction({
    action: "create",
    module: "suppliers",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      return tx.supplier.create({
        data: {
          address: data.address,
          branchId: scope.branchId,
          companyId: tenant.companyId,
          companyName: data.companyName,
          contactPerson: data.contactPerson,
          creditLimit: numberValue(data.creditLimit),
          creditTerms: data.creditTerms,
          email: data.email,
          name: stringValue(data.companyName, "Supplier"),
          note: data.note,
          openingBalance: numberValue(data.openingBalance),
          outstandingBalance: numberValue(data.openingBalance),
          phone: data.phone,
          supplierCode: data.supplierCode,
          taxNumber: data.taxNumber,
        },
      });
    },
  });
}

export async function updatePrismaSupplier(supplierId: string, input: SupplierUpdateInput, tenant: TenantContext) {
  const data = parseSupplierUpdateInput(input);
  return withTenantTransaction({
    action: "update",
    module: "suppliers",
    newData: { supplierId, ...data },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.supplier.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: supplierId, ...branchOwnedWhere(scope) },
      });
      const updateData = {
        ...data,
        name: typeof data.companyName === "string" && data.companyName.trim() ? data.companyName : undefined,
      };
      return tx.supplier.update({ data: updateData, where: { id: existing.id } });
    },
  });
}

export async function archivePrismaSupplier(supplierId: string, tenant: TenantContext) {
  return updatePrismaSupplier(supplierId, { status: "inactive" }, tenant);
}
