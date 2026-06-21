import type { Customer, CustomerPayment, CustomerPurchase, MembershipLevel } from "@/features/customers/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  getPrismaCustomerById,
  getPrismaCustomerDetail,
  getPrismaCustomers,
  getPrismaCustomersSnapshot,
} from "@/features/customers/prisma-repository";

export async function getCustomersSnapshot(): Promise<{
  customers: Customer[];
  levels: MembershipLevel[];
  payments: CustomerPayment[];
  purchases: CustomerPurchase[];
}> {
  return getPrismaCustomersSnapshot(tenantFromSession(await requireSession()));
}

export async function getCustomers(): Promise<Customer[]> {
  return getPrismaCustomers(tenantFromSession(await requireSession()));
}

export async function getCustomerById(customerId: string): Promise<Customer | undefined> {
  return getPrismaCustomerById(customerId, tenantFromSession(await requireSession()));
}

export async function getCustomerDetail(customerId: string): Promise<{
  customer: Customer | undefined;
  levels: MembershipLevel[];
  payments: CustomerPayment[];
  purchases: CustomerPurchase[];
}> {
  return getPrismaCustomerDetail(customerId, tenantFromSession(await requireSession()));
}
