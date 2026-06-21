import { prisma } from "@/lib/db/prisma";
import type { CustomerPayment, CustomerPurchase } from "@/features/customers/types";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
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

const db = prisma as any;

export async function getPrismaCustomersSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
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
      include: { payments: true },
      orderBy: { createdAt: "desc" },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
  ]);

  return {
    customers: customers.map(mapPrismaCustomer),
    levels: levels.map(mapPrismaMembershipLevel),
    payments: payments.map(mapPrismaCustomerPayment),
    purchases: purchases.map(mapPrismaCustomerPurchase),
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

export async function createPrismaCustomer(input: CustomerCreateInput, tenant: TenantContext) {
  const data = parseCustomerCreateInput(input);
  return withTenantTransaction({
    action: "create",
    module: "customers",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      return tx.customer.create({
        data: {
          address: data.address,
          birthday: data.birthday ? new Date(data.birthday) : data.birthday,
          branchId: scope.branchId,
          companyId: tenant.companyId,
          creditLimit: numberValue(data.creditLimit),
          customerCode: data.customerCode,
          email: data.email,
          fullName: stringValue(data.fullName),
          membershipLevelId: data.membershipLevelId,
          notes: data.notes,
          openingBalance: numberValue(data.openingBalance),
          outstandingBalance: numberValue(data.openingBalance),
          phone: data.phone,
        },
      });
    },
  });
}

export async function updatePrismaCustomer(customerId: string, input: CustomerUpdateInput, tenant: TenantContext) {
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
