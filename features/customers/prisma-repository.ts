import { prisma } from "@/lib/db/prisma";
import type { CustomerPayment, CustomerPurchase } from "@/features/customers/types";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import {
  mapPrismaCustomer,
  mapPrismaCustomerPayment,
  mapPrismaCustomerPurchase,
  mapPrismaMembershipLevel,
} from "@/features/customers/dto-mapper";
import {
  parseCustomerCreateInput,
  parseCustomerPaymentInput,
  parseCustomerUpdateInput,
  type CustomerCreateInput,
  type CustomerPaymentInput,
  type CustomerUpdateInput,
} from "@/features/customers/dto";
import { adjustCustomerLoyaltyPoints } from "@/features/loyalty/loyalty-service";

export { adjustCustomerLoyaltyPoints };

const db = prisma as any;

export async function getPrismaCustomersSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const settings = await db.companySetting.findUnique({
    select: { loyaltySpendPerPointLak: true },
    where: { companyId: scope.companyId },
  });
  const loyaltySpendPerPointLak = Math.max(Number(settings?.loyaltySpendPerPointLak ?? 10_000), 1);
  const [customers, levels, payments, purchases] = await Promise.all([
    db.customer.findMany({
      include: { loyaltyPointLedger: true, membershipLevel: true },
      orderBy: { createdAt: "desc" },
      where: { companyId: scope.companyId, ...branchWhere },
    }),
    db.membershipLevel.findMany({
      orderBy: { minSpendLak: "asc" },
      where: { companyId: scope.companyId },
    }),
    db.customerPayment.findMany({
      orderBy: { paidAt: "desc" },
      where: { companyId: scope.companyId, customer: branchWhere },
    }),
    db.sale.findMany({
      include: { loyaltyPointLedger: true, payments: true },
      orderBy: { createdAt: "desc" },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
  ]);

  return {
    customers: customers.map(mapPrismaCustomer),
    levels: levels.map(mapPrismaMembershipLevel),
    payments: payments.map(mapPrismaCustomerPayment),
    purchases: purchases.map((sale: Record<string, unknown>) => mapPrismaCustomerPurchase(sale, loyaltySpendPerPointLak)),
  };
}

export async function getPrismaCustomers(tenant: TenantContext) {
  const { customers } = await getPrismaCustomersSnapshot(tenant);
  return customers;
}

export async function getPrismaCustomerById(customerId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const customer = await db.customer.findFirst({
    include: { loyaltyPointLedger: true, membershipLevel: true },
    where: { companyId: scope.companyId, id: customerId, ...branchWhere },
  });

  return customer ? mapPrismaCustomer(customer) : undefined;
}

export async function getPrismaCustomerDetail(customerId: string, tenant: TenantContext) {
  const [snapshot, customer] = await Promise.all([
    getPrismaCustomersSnapshot(tenant),
    getPrismaCustomerById(customerId, tenant),
  ]);

  return {
    customer,
    levels: snapshot.levels,
    payments: snapshot.payments.filter((payment: CustomerPayment) => payment.customerId === customerId),
    purchases: snapshot.purchases.filter((purchase: CustomerPurchase) => purchase.customerId === customerId),
  };
}

async function allocateMemberCode(tx: Record<string, any>, companyId: string) {
  await tx.$queryRaw`
    SELECT company_id FROM company_settings WHERE company_id = ${companyId} FOR UPDATE
  `;
  const rows = await tx.customer.findMany({
    select: { customerCode: true },
    where: { companyId, customerCode: { startsWith: "MEM-" } },
  });
  let max = 0;
  for (const row of rows) {
    const parsed = Number(String(row.customerCode ?? "").replace(/^MEM-/, ""));
    if (Number.isFinite(parsed) && parsed > max) {
      max = parsed;
    }
  }
  return `MEM-${String(max + 1).padStart(6, "0")}`;
}

export async function createPrismaCustomer(input: CustomerCreateInput, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.customersCreate);
  const data = parseCustomerCreateInput(input);
  const phone = stringValue(data.phone);
  if (!phone) {
    throw new Error("Phone is required.");
  }
  return withTenantTransaction({
    action: "create",
    module: "customers",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const requestedCode = optionalString(data.customerCode);
      const memberCode = requestedCode ?? await allocateMemberCode(tx, tenant.companyId);
      return tx.customer.create({
        data: {
          address: data.address,
          birthday: data.birthday ? new Date(data.birthday) : data.birthday,
          branchId: scope.branchId,
          companyId: tenant.companyId,
          creditLimit: numberValue(data.creditLimit),
          customerCode: memberCode,
          email: data.email,
          fullName: stringValue(data.fullName),
          membershipLevelId: data.membershipLevelId,
          notes: data.notes,
          openingBalance: numberValue(data.openingBalance),
          outstandingBalance: numberValue(data.openingBalance),
          phone,
          qrMemberCode: memberCode,
        },
      });
    },
  });
}

export async function updatePrismaCustomer(customerId: string, input: CustomerUpdateInput, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.customersUpdate);
  const data = parseCustomerUpdateInput(input);
  return withTenantTransaction({
    action: "update",
    module: "customers",
    newData: { customerId, ...data },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.customer.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: customerId, ...branchOwnedWhere(scope) },
      });
      return tx.customer.update({
        data: {
          ...data,
          birthday: data.birthday ? new Date(data.birthday) : data.birthday,
        },
        where: { id: existing.id },
      });
    },
  });
}

export async function archivePrismaCustomer(customerId: string, tenant: TenantContext) {
  return updatePrismaCustomer(customerId, { status: "inactive" }, tenant);
}

export async function createPrismaCustomerPayment(input: CustomerPaymentInput, tenant: TenantContext) {
  const data = parseCustomerPaymentInput(input);
  return withTenantTransaction({
    action: "payment",
    module: "customers",
    newData: data,
    tenant,
    write: async (tx) => {
      const customer = await tx.customer.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: data.customerId, ...branchOwnedWhere(await resolveTenantScope(tenant, tx)) },
      });
      const amountLak = numberValue(data.amountLak);
      const payment = await tx.customerPayment.create({
        data: {
          amountLak,
          companyId: tenant.companyId,
          customerId: customer.id,
          note: optionalString(data.note),
          paymentMethod: data.paymentMethod === "bank" ? "transfer" : (data.paymentMethod ?? "cash"),
          paymentNo: optionalString(data.paymentNo),
        },
      });

      await tx.customer.update({
        data: {
          outstandingBalance: Math.max(Number(customer.outstandingBalance ?? 0) - amountLak, 0),
        },
        where: { id: customer.id },
      });

      return payment;
    },
  });
}
