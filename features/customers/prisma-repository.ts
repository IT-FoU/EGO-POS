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
import {
  CUSTOMER_CODE_PREFIX,
  CUSTOMER_CODE_RETRY_LIMIT,
  customerCodeLockKey,
  isCustomerCodeUniqueCollision,
  nextCustomerCode,
} from "@/features/customers/customer-code";

export { adjustCustomerLoyaltyPoints };

const db = prisma as any;

export async function getPrismaCustomersSnapshot(tenant: TenantContext, client: any = db) {
  const scope = await resolveTenantScope(tenant, client);
  const branchWhere = branchOwnedWhere(scope);
  const settings = await client.companySetting.findUnique({
    select: { loyaltySpendPerPointLak: true },
    where: { companyId: scope.companyId },
  });
  const loyaltySpendPerPointLak = Math.max(Number(settings?.loyaltySpendPerPointLak ?? 10_000), 1);
  const [customers, levels, payments, purchases] = await Promise.all([
    client.customer.findMany({
      include: { loyaltyPointLedger: true, membershipLevel: true },
      orderBy: { createdAt: "desc" },
      where: { companyId: scope.companyId, ...branchWhere },
    }),
    client.membershipLevel.findMany({
      orderBy: { minSpendLak: "asc" },
      where: { companyId: scope.companyId },
    }),
    client.customerPayment.findMany({
      orderBy: { paidAt: "desc" },
      where: { companyId: scope.companyId, customer: branchWhere },
    }),
    client.sale.findMany({
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
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customerCodeLockKey(companyId)}))`;
  const rows = await tx.customer.findMany({
    select: { customerCode: true },
    where: { companyId, customerCode: { startsWith: CUSTOMER_CODE_PREFIX } },
  });
  return nextCustomerCode(rows.map((row: { customerCode?: string | null }) => row.customerCode));
}

async function createCustomerRecord(
  data: ReturnType<typeof parseCustomerCreateInput>,
  phone: string,
  tenant: TenantContext,
  memberCode?: string,
) {
  return withTenantTransaction({
    action: "create",
    module: "customers",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const code = memberCode ?? (await allocateMemberCode(tx, tenant.companyId));
      return tx.customer.create({
        data: {
          address: data.address,
          birthday: data.birthday ? new Date(data.birthday) : data.birthday,
          branchId: scope.branchId,
          companyId: tenant.companyId,
          creditLimit: numberValue(data.creditLimit),
          customerCode: code,
          email: data.email,
          fullName: stringValue(data.fullName),
          membershipLevelId: data.membershipLevelId,
          notes: data.notes,
          openingBalance: numberValue(data.openingBalance),
          outstandingBalance: numberValue(data.openingBalance),
          phone,
          qrMemberCode: code,
        },
      });
    },
  });
}

export async function createPrismaCustomer(input: CustomerCreateInput, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.customersCreate);
  const data = parseCustomerCreateInput(input);
  const phone = stringValue(data.phone);
  if (!phone) {
    throw new Error("Phone is required.");
  }
  const requestedCode = optionalString(data.customerCode);
  if (requestedCode) {
    return createCustomerRecord(data, phone, tenant, requestedCode);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < CUSTOMER_CODE_RETRY_LIMIT; attempt += 1) {
    try {
      return await createCustomerRecord(data, phone, tenant);
    } catch (error) {
      lastError = error;
      if (!isCustomerCodeUniqueCollision(error) || attempt === CUSTOMER_CODE_RETRY_LIMIT - 1) {
        throw error;
      }
    }
  }
  throw lastError;
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
