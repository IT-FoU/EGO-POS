import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  getPrismaProductById,
  getPrismaUnitPricingDefaults,
  writePrismaProductCreate,
} from "../features/products/prisma-repository";
import {
  applyRoundingToAllUnits,
  applyUnitPricingPatch,
  deriveSharedUnitCost,
  sellingPriceFromCost,
  syncSharedStockCosts,
} from "../features/products/unit-pricing";
import { applyDefaultsToNewUnit, parseUnitPricingDefaults } from "../features/products/unit-pricing-defaults";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

class RollbackError extends Error {
  constructor() {
    super("FIX-23 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const piece = { addAmountLak: 0, conversionQty: 1, costPriceLak: 0, id: "piece", markupPercent: 0, pricingMode: "manual" as const, roundingLak: 0, sellingPriceLak: 0, status: "active" as const, unitName: "Piece" };
const pack = { ...piece, conversionQty: 6, id: "pack", unitName: "Pack" };
const box = { ...piece, conversionQty: 24, id: "box", unitName: "Box" };

check("A. Box 250000 / 24 = Piece 10416", () => {
  assert(deriveSharedUnitCost(250000, 24, 1) === 10416, `got ${deriveSharedUnitCost(250000, 24, 1)}`);
});

check("B. Piece 11000 * 6 = Pack 66000", () => {
  assert(deriveSharedUnitCost(11000, 1, 6) === 66000, `got ${deriveSharedUnitCost(11000, 1, 6)}`);
});

check("C. Piece 11000 * 24 = Box 264000", () => {
  assert(deriveSharedUnitCost(11000, 1, 24) === 264000, `got ${deriveSharedUnitCost(11000, 1, 24)}`);
});

check("R. Box cost edit does not rewrite Piece or Pack", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000 },
    shareStock: true,
    units: [piece, pack, box],
  });
  const synced = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 250000 },
    shareStock: true,
    units: start,
  });
  assert(synced.find((unit) => unit.id === "piece")?.costPriceLak === 5000, "piece cost");
  assert(synced.find((unit) => unit.id === "pack")?.costPriceLak === 30000, "pack cost");
  assert(synced.find((unit) => unit.id === "box")?.costPriceLak === 120000, "box stays derived");
});

check("Q. Piece cost recalculates Pack and Box", () => {
  const synced = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 11000 },
    shareStock: true,
    units: [piece, pack, box],
  });
  assert(synced.find((unit) => unit.id === "pack")?.costPriceLak === 66000, "pack cost");
  assert(synced.find((unit) => unit.id === "box")?.costPriceLak === 264000, "box cost");
});

check("D. 12100 markup 0 round 500 → 12500", () => {
  assert(sellingPriceFromCost({ costPriceLak: 12100, markupPercent: 0, pricingMode: "cost_plus_percent", roundingLak: 500 }) === 12500, "D");
});

check("E. 12100 markup 0 round 1000 → 13000", () => {
  assert(sellingPriceFromCost({ costPriceLak: 12100, markupPercent: 0, pricingMode: "cost_plus_percent", roundingLak: 1000 }) === 13000, "E");
});

check("F. 12500 round 500 stays 12500", () => {
  assert(sellingPriceFromCost({ costPriceLak: 12500, markupPercent: 0, pricingMode: "cost_plus_percent", roundingLak: 500 }) === 12500, "F");
});

check("G. 12501 round 500 → 13000", () => {
  assert(sellingPriceFromCost({ costPriceLak: 12501, markupPercent: 0, pricingMode: "cost_plus_percent", roundingLak: 500 }) === 13000, "G");
});

check("J/K/L. Cost, markup, rounding recalc independently", () => {
  const start = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 10416, markupPercent: 30, pricingMode: "cost_plus_percent", roundingLak: 500 },
    shareStock: true,
    units: [{ ...piece, pricingMode: "cost_plus_percent", markupPercent: 30, roundingLak: 500 }],
  });
  assert(start[0].sellingPriceLak === 14000, `expected 14000 got ${start[0].sellingPriceLak}`);
  const afterCost = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 11000 },
    shareStock: true,
    units: start,
  });
  assert(afterCost[0].sellingPriceLak === 14500, `cost change got ${afterCost[0].sellingPriceLak}`);
  const afterMarkup = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { markupPercent: 20 },
    shareStock: true,
    units: afterCost,
  });
  assert(afterMarkup[0].sellingPriceLak === 13500, `markup change got ${afterMarkup[0].sellingPriceLak}`);
  const afterRound = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { roundingLak: 1000 },
    shareStock: true,
    units: afterMarkup,
  });
  assert(afterRound[0].sellingPriceLak === 14000, `rounding change got ${afterRound[0].sellingPriceLak}`);
});

check("M. Piece/Pack/Box different markup calculate independently", () => {
  const priced = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 10416 },
    shareStock: true,
    units: [
      { ...piece, markupPercent: 30, pricingMode: "cost_plus_percent", roundingLak: 500 },
      { ...pack, markupPercent: 20, pricingMode: "cost_plus_percent", roundingLak: 1000 },
      { ...box, markupPercent: 15, pricingMode: "cost_plus_percent", roundingLak: 1000 },
    ],
  });
  assert(priced[0].sellingPriceLak === 14000, `piece price ${priced[0].sellingPriceLak}`);
  assert(priced[1].sellingPriceLak === 75000, `pack price ${priced[1].sellingPriceLak}`);
  assert(priced[2].sellingPriceLak === 288000, `box price ${priced[2].sellingPriceLak}`);
});

check("H. Manual mode does not overwrite selling price", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 11000 },
    shareStock: false,
    units: [{ ...piece, pricingMode: "manual", sellingPriceLak: 19999 }],
  });
  assert(next[0].sellingPriceLak === 19999, "manual selling mutated");
});

check("Apply rounding to all units", () => {
  const next = applyRoundingToAllUnits(
    [
      { ...piece, pricingMode: "cost_plus_percent", costPriceLak: 12100 },
      { ...pack, pricingMode: "cost_plus_percent", costPriceLak: 12100 },
    ],
    1000,
  );
  assert(next.every((unit) => unit.roundingLak === 1000), "rounding not applied to all");
  assert(next.every((unit) => unit.sellingPriceLak === 13000), "prices not recalculated");
});

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
check("I. Cost + Percent selling price is read-only in the form", () => {
  assert(productForm.includes('disabled={(unit.pricingMode ?? "manual") !== "manual"}'), "selling price is not locked");
  assert(productForm.includes("applyRoundingToAllUnits"), "missing apply-to-all control");
  assert(productForm.includes("applyUnitPricingPatch"), "form does not use shared-stock pricing patch");
});

check("Independent stock does not sync costs", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 250000 },
    shareStock: false,
    units: [piece, box],
  });
  assert(next[0].costPriceLak === 0, "independent piece cost changed");
  assert(next[1].costPriceLak === 250000, "edited cost missing");
});

async function createIsolatedTenant(tx: any, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `FIX-23 ${label}`, passwordHash: "isolated-fixture", username: `e23u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `FIX-23 ${label}`, ownerUserId: user.id, storeCode: `e23${token}` },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
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
  return { tenant };
}

async function main() {
  loadProjectEnvFiles();
  const url = resolveScriptDatabaseUrl("test-write");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function isolated(name: string, run: (tx: any) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      });
    } catch (error) {
      if (error instanceof RollbackError) {
        results.push({ name, status: "PASS" });
        console.log(`PASS  ${name}`);
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ detail, name, status: "FAIL" });
      console.log(`FAIL  ${name} — ${detail}`);
    }
  }

  await isolated("N. Company defaults persist for next new product", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "defaults");
    await writePrismaProductCreate(tx, {
      nameLo: "Template",
      sellingPriceLak: 14000,
      sku: "E23-TMP",
      units: [{
        conversionQty: 1,
        costPriceLak: 10416,
        isBaseUnit: true,
        markupPercent: 30,
        pricingMode: "cost_plus_percent",
        roundingLak: 500,
        sellingPriceLak: 1,
        unitName: "Piece",
      }],
    }, tenant);
    const defaults = await getPrismaUnitPricingDefaults(tenant, tx);
    const seeded = applyDefaultsToNewUnit({
      markupPercent: 0,
      pricingMode: "manual" as const,
      roundingLak: 0,
      unitName: "Piece",
    }, defaults);
    assert(seeded.markupPercent === 30, `markup ${seeded.markupPercent}`);
    assert(seeded.pricingMode === "cost_plus_percent", "mode");
    assert(seeded.roundingLak === 500, "rounding");
  });

  await isolated("O. Company defaults are tenant scoped", async (tx) => {
    const a = await createIsolatedTenant(tx, "a");
    const b = await createIsolatedTenant(tx, "b");
    await writePrismaProductCreate(tx, {
      nameLo: "A",
      sellingPriceLak: 1,
      sku: "E23-A",
      units: [{ conversionQty: 1, isBaseUnit: true, markupPercent: 30, pricingMode: "cost_plus_percent", roundingLak: 500, sellingPriceLak: 1, unitName: "Piece" }],
    }, a.tenant);
    const defaultsB = await getPrismaUnitPricingDefaults(b.tenant, tx);
    assert(parseUnitPricingDefaults(defaultsB).units.piece === undefined, "company B inherited A defaults");
  });

  await isolated("P. Changing defaults does not modify existing products", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "protect");
    const first = await writePrismaProductCreate(tx, {
      nameLo: "Keep",
      sellingPriceLak: 19999,
      sku: "E23-KEEP",
      units: [{ conversionQty: 1, isBaseUnit: true, pricingMode: "manual", roundingLak: 0, sellingPriceLak: 19999, unitName: "Piece" }],
    }, tenant);
    await writePrismaProductCreate(tx, {
      nameLo: "Next",
      sellingPriceLak: 1,
      sku: "E23-NEXT",
      units: [{ conversionQty: 1, isBaseUnit: true, markupPercent: 15, pricingMode: "cost_plus_percent", roundingLak: 1000, sellingPriceLak: 1, unitName: "Piece" }],
    }, tenant);
    const reloaded = await getPrismaProductById(first.id, tenant, tx);
    assert(reloaded?.units[0]?.sellingPriceLak === 19999, "existing selling price changed");
    assert(reloaded?.units[0]?.pricingMode === "manual", "existing mode changed");
  });

  await prisma.$disconnect();
  const failed = results.filter((row) => row.status === "FAIL");
  console.log(JSON.stringify({ failed: failed.length, passed: results.filter((row) => row.status === "PASS").length, results, total: results.length }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
