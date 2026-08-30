import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PRODUCTION_DB_FINGERPRINT,
  assertSafeDatabaseTarget,
  classifyDatabaseUrl,
  fingerprintDatabaseUrl,
} from "../lib/db/database-target";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

function client(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

loadProjectEnvFiles();
const devUrl = resolveScriptDatabaseUrl("dev-write");
const testUrl = resolveScriptDatabaseUrl("test-write");
if (classifyDatabaseUrl(devUrl) !== "LOCAL" || classifyDatabaseUrl(testUrl) !== "LOCAL") {
  throw new Error("Isolation proof refused: local URLs are not LOCAL");
}

const fakeProd = `postgresql://postgres:secret@db.${PRODUCTION_DB_FINGERPRINT}.supabase.co:5432/postgres`;
let refusedDev = false;
let refusedTest = false;
try {
  assertSafeDatabaseTarget({ databaseUrl: fakeProd, environment: "development" });
} catch (error) {
  refusedDev = error instanceof Error && error.message.includes("REFUSING LOCAL DATABASE ACCESS");
}
try {
  assertSafeDatabaseTarget({ databaseUrl: fakeProd, environment: "test" });
} catch (error) {
  refusedTest = error instanceof Error && error.message.includes("REFUSING LOCAL DATABASE ACCESS");
}

const dev = client(devUrl);
const test = client(testUrl);
const sku = "ENV-TEST-MUTATION";
const barcode = "ENVTESTLOCAL";

const company = await dev.company.findFirst({ where: { id: "gobox-company" } });
const branch = await dev.branch.findFirst({ where: { id: "gobox-main-branch" } });
if (!company || !branch) throw new Error("Dev seed missing");

const created = await dev.product.create({
  data: {
    barcode,
    branchId: branch.id,
    companyId: company.id,
    nameEn: "ENV TEST PRODUCT",
    nameLo: "ENV TEST PRODUCT",
    sku,
  },
});
const devHas = await dev.product.count({ where: { sku } });
const testHas = await test.product.count({ where: { sku } });
await dev.product.delete({ where: { id: created.id } });

const testCompany = await test.company.create({
  data: {
    businessTemplateKey: "mini_mart",
    name: "ENV01A Test Co",
    storeCode: "env01a",
  },
});
const testBranch = await test.branch.create({
  data: { companyId: testCompany.id, isMainBranch: true, name: "ENV01A Branch" },
});
const testProduct = await test.product.create({
  data: {
    barcode: "ENVTESTONLY",
    branchId: testBranch.id,
    companyId: testCompany.id,
    nameEn: "TEST ONLY PRODUCT",
    nameLo: "TEST ONLY PRODUCT",
    sku: "ENV-TEST-ONLY",
  },
});
const devSawTestSku = await dev.product.count({ where: { sku: "ENV-TEST-ONLY" } });
await test.product.delete({ where: { id: testProduct.id } });
await test.branch.delete({ where: { id: testBranch.id } });
await test.company.delete({ where: { id: testCompany.id } });

const testPing = await test.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
const devPing = await dev.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;

await dev.$disconnect();
await test.$disconnect();

console.log(
  JSON.stringify(
    {
      devClass: classifyDatabaseUrl(devUrl),
      testClass: classifyDatabaseUrl(testUrl),
      devFp: fingerprintDatabaseUrl(devUrl),
      testFp: fingerprintDatabaseUrl(testUrl),
      refusedDev,
      refusedTest,
      developmentRecordCreated: devHas === 1,
      testDidNotSeeDevMutation: testHas === 0,
      testSelect1: Number(testPing[0]?.one) === 1,
      devSelect1: Number(devPing[0]?.one) === 1,
      testMutationCreated: Boolean(testProduct.id),
      developmentAffectedByTest: devSawTestSku !== 0,
    },
    null,
    2,
  ),
);
