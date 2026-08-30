import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "@/lib/db/database-url";
import { assertSafeDatabaseTarget, inferDatabaseRole, isBuildPhase } from "@/lib/db/database-target";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

type WorkerEnv = {
  DATABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString?: string;
  };
};

function hostOf(url: string) {
  return url.split("@")[1]?.split("/")[0] ?? "missing";
}

function isCloudflareWorkerRuntime() {
  return typeof navigator === "object" && navigator.userAgent === "Cloudflare-Workers";
}

function readWorkerEnv(): WorkerEnv | null {
  try {
    return getCloudflareContext().env as WorkerEnv;
  } catch {
    return null;
  }
}

function readConnectionString() {
  const workerEnv = readWorkerEnv();
  const workerRuntime = isCloudflareWorkerRuntime();

  if (workerRuntime) {
    const connectionString = workerEnv?.HYPERDRIVE?.connectionString;
    if (!connectionString) {
      throw new Error("HYPERDRIVE binding is required in the Cloudflare Worker runtime");
    }

    console.log(`prisma-db-host=${hostOf(connectionString)} worker=yes transport=hyperdrive`);
    return connectionString;
  }

  if (isBuildPhase()) {
    return getDatabaseUrl();
  }

  // Local Next.js / scripts must never inherit Worker or .dev.vars Production URLs.
  const connectionString = getDatabaseUrl();
  const role = inferDatabaseRole() === "production" ? "development" : inferDatabaseRole();
  assertSafeDatabaseTarget({
    databaseUrl: connectionString,
    environment: role,
    operation: "prisma-client",
  });
  console.log(`prisma-db-host=${hostOf(connectionString)} worker=no transport=database_url`);
  return connectionString;
}

function createPrismaClient() {
  const connectionString = readConnectionString();
  const workerRuntime = isCloudflareWorkerRuntime();

  const localDatabase = /localhost|127\.0\.0\.1/.test(connectionString);

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(workerRuntime || localDatabase ? {} : { ssl: { rejectUnauthorized: false } }),
      // Hyperdrive already pools at the edge. Prisma+Workers guidance is max: 1 so
      // the isolate does not open a second TCP client. maxUses: 1 is kept because
      // reusing a PrismaPg connection across Worker invocations has hung isolates
      // (prisma/prisma#28193). Do not raise these without a Worker soak test.
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
