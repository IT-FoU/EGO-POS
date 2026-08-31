import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaInventoryListPage } from "../features/inventory/prisma-repository";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";

class RollbackError extends Error {
  constructor() {
    super("PERF-09B probe rollback");
    this.name = "RollbackError";
  }
}

function wrapClient(tx: any) {
  const stages: Array<{ ms: number; name: string; rows: number }> = [];
  function tap(name: string, fn: (...args: unknown[]) => Promise<unknown>) {
    return async (...args: unknown[]) => {
      const started = Date.now();
      const result = await fn(...args);
      const rows = Array.isArray(result) ? result.length : result == null ? 0 : 1;
      stages.push({ ms: Date.now() - started, name, rows });
      return result;
    };
  }
  tx.warehouse.findMany = tap("warehouses.findMany", tx.warehouse.findMany.bind(tx.warehouse));
  tx.inventoryBalance.findMany = tap("inventoryBalance.findMany", tx.inventoryBalance.findMany.bind(tx.inventoryBalance));
  tx.stockMovement.findMany = tap("stockMovement.findMany", tx.stockMovement.findMany.bind(tx.stockMovement));
  tx.saleItem.groupBy = tap("saleItem.groupBy", tx.saleItem.groupBy.bind(tx.saleItem));
  tx.$queryRaw = tap("$queryRaw", tx.$queryRaw.bind(tx));
  return stages;
}

async function seed(tx: any, count: number) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `PERF-09B ${count}`, passwordHash: "probe", username: `p9b${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `PERF-09B ${count}`, ownerUserId: user.id, storeCode: `p9b${token}` },
  });
  const branch = await tx.branch.create({ data: { companyId: company.id, isMainBranch: true, name: "Main" } });
  const warehouse = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  await tx.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouse.id,
  };
  const chunk = 500;
  for (let offset = 0; offset < count; offset += chunk) {
    const slice = Array.from({ length: Math.min(chunk, count - offset) }, (_, index) => {
      const n = offset + index;
      return {
        barcode: `P9B${String(n).padStart(10, "0")}`,
        branchId: tenant.branchId!,
        companyId: tenant.companyId,
        costPriceLak: 8000,
        minStock: 5,
        nameEn: `Probe ${n}`,
        nameLo: `Probe ${n}`,
        sellingPriceLak: 10000,
        sku: `P9B-${String(n).padStart(4, "0")}`,
        status: "active" as const,
      };
    });
    const created = await tx.product.createManyAndReturn({ data: slice });
    await tx.productUnit.createMany({
      data: created.map((product: { barcode: string; id: string }) => ({
        barcode: product.barcode,
        conversionQty: 1,
        costPriceLak: 8000,
        isBaseUnit: true,
        productId: product.id,
        sellingPriceLak: 10000,
        unitName: "Piece",
      })),
    });
    await tx.inventoryBalance.createMany({
      data: created.map((product: { id: string }) => ({
        companyId: tenant.companyId,
        productId: product.id,
        quantity: 2,
        warehouseId: warehouse.id,
      })),
    });
  }
  return { tenant, warehouseId: warehouse.id };
}

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const size = Number(process.argv[2] || 5000);
  try {
    await client.$transaction(
      async (tx) => {
        const { tenant } = await seed(tx, size);
        const stages = wrapClient(tx);
        const started = Date.now();
        const page = await getPrismaInventoryListPage(tenant, { page: 1, pageSize: 100 }, tx);
        const totalMs = Date.now() - started;
        console.log(
          JSON.stringify(
            {
              items: page.items.length,
              payloadBytes: Buffer.byteLength(JSON.stringify(page.items), "utf8"),
              stages,
              summary: page.summary,
              totalCount: page.totalCount,
              totalMs,
            },
            null,
            2,
          ),
        );
        throw new RollbackError();
      },
      { maxWait: 20_000, timeout: 180_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackError)) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } finally {
    await client.$disconnect();
  }
}

main();
