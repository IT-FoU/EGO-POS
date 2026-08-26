import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseUrl } from "@/lib/db/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: 1,
      maxUses: 1,
    }),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

const prismaForRequest = cache(createPrismaClient);

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma ??= createPrismaClient();
    return globalForPrisma.prisma;
  }

  return prismaForRequest();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
