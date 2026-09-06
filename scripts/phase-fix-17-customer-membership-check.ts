import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { mapPrismaCustomer, mapPrismaMembershipLevel } from "../features/customers/dto-mapper";
import { membershipDisplayLabel } from "../features/customers/membership-display";
import {
  CUSTOMER_CODE_PREFIX,
  formatCustomerCode,
  isCustomerCodeUniqueCollision,
  nextCustomerCode,
} from "../features/customers/customer-code";
import { mapPrismaPosCustomer } from "../features/pos/dto-mapper";
import {
  isMembershipEligibleForBenefits,
  resolveMembershipDiscountPercent,
} from "../features/loyalty/loyalty-service";
import { t } from "../lib/i18n/ui";
import { WRITE_PERMISSIONS, assertPermission } from "../lib/auth/permissions";

const TARGET_REF = "ieutdqnlfiiaawctapor";

loadProjectEnvFiles();
process.env.IGO_DEMO_MODE = "false";
const url = resolveScriptDatabaseUrl("test-write");
if (url.includes(TARGET_REF)) {
  throw new Error("Refusing FIX-17: test URL is Production");
}

const prisma = createScriptPrismaClient("test-write");
(globalThis as unknown as { prisma?: typeof prisma }).prisma = prisma;

const { createPrismaCustomer, getPrismaCustomersSnapshot } = await import("../features/customers/prisma-repository");
const { getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");

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

async function checkAsync(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function posLookup(customers: Array<Record<string, any>>, rawQuery: string) {
  const query = rawQuery.toLowerCase();
  const compactQuery = rawQuery.replace(/\s+/g, "");
  const digitQuery = rawQuery.replace(/\D/g, "");
  return customers.find((item) => {
    const name = String(item.name ?? item.fullName ?? "").toLowerCase();
    const phone = String(item.phone ?? "").replace(/\D/g, "");
    const code = String(item.customerCode ?? "").toLowerCase();
    const membership = String(item.membershipNumber ?? "").toLowerCase();
    return (
      name === query ||
      code === query ||
      membership === query ||
      phone === digitQuery ||
      name.includes(query) ||
      code.includes(query) ||
      membership.includes(query)
    ) && (compactQuery.length > 0);
  });
}

async function createOwnerTenant(label: string) {
  const token = randomBytes(4).toString("hex");
  const user = await prisma.user.create({
    data: { fullName: `FIX-17 ${label}`, passwordHash: "isolated-fixture", username: `f17${token}` },
  });
  const company = await prisma.company.create({
    data: {
      businessTemplateKey: "mini_mart",
      name: `FIX-17 ${label}`,
      ownerUserId: user.id,
      storeCode: `f17${token}`,
    },
  });
  const branch = await prisma.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await prisma.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH", type: "store" },
  });
  await prisma.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  await prisma.companySetting.create({
    data: { companyId: company.id },
  });
  return {
    branch,
    company,
    tenant: {
      branchId: branch.id,
      companyId: company.id,
      userId: user.id,
      warehouseId: warehouse.id,
    },
    token,
    user,
  };
}

const mapperSrc = readFileSync(join(process.cwd(), "features/customers/dto-mapper.ts"), "utf8");
const repoSrc = readFileSync(join(process.cwd(), "features/customers/prisma-repository.ts"), "utf8");
const formSrc = readFileSync(join(process.cwd(), "features/customers/components/customer-form.tsx"), "utf8");
const en = JSON.parse(readFileSync(join(process.cwd(), "locales/ui/en.json"), "utf8")) as Record<string, string>;

check("Display fallback no longer maps unknown/null to Standard", () => {
  assert(!mapperSrc.includes('? value : "Standard"'), "old Standard fallback still present");
  assert(mapperSrc.includes("membershipLevelNameFromRelation"), "mapper must use relation name helper");
});

check("Allocator uses advisory lock + bounded retry", () => {
  assert(repoSrc.includes("pg_advisory_xact_lock"), "advisory lock missing");
  assert(repoSrc.includes("isCustomerCodeUniqueCollision"), "retry collision detector missing");
  assert(repoSrc.includes("CUSTOMER_CODE_RETRY_LIMIT"), "retry limit missing");
  assert(!repoSrc.includes("FROM company_settings WHERE company_id"), "row-dependent FOR UPDATE should not be the allocator lock");
});

check("Create form defaults to no membership", () => {
  assert(formSrc.includes('defaultValue=""'), "create form must not default to first level");
  assert(formSrc.includes('t("ui.no.membership")'), "create form must offer No Membership");
});

check("Localization EN No Membership", () => {
  assert(en["ui.no.membership"] === "No Membership", `en=${en["ui.no.membership"]}`);
  assert(t("ui.no.membership", "en") === "No Membership", "en t()");
  assert(t("ui.no.membership", "th") === "No Membership", "legacy th t()");
  assert(t("ui.no.membership", "lo") === "No Membership", "lo stays English this phase");
});

check("DTO: null level is no membership, not Standard", () => {
  const mapped = mapPrismaCustomer({
    customerCode: "MEM-000001",
    fullName: "UAT CUST 16A",
    membershipLevel: null,
    membershipLevelId: null,
    phone: "02055551601",
    pointsBalance: 0,
    status: "active",
  });
  assert(mapped.membershipLevel === null, `mapped=${mapped.membershipLevel}`);
  assert(membershipDisplayLabel(mapped.membershipLevel, "en") === "No Membership", "EN label");
  assert(membershipDisplayLabel(mapped.membershipLevel, "th") === "No Membership", "legacy th label");
});

check("DTO: custom level name is preserved", () => {
  const mapped = mapPrismaCustomer({
    customerCode: "MEM-000002",
    fullName: "Custom Member",
    membershipLevel: { name: "UAT MEMBER" },
    membershipLevelId: "lvl-custom",
    phone: "02055551602",
    pointsBalance: 0,
    status: "active",
  });
  assert(mapped.membershipLevel === "UAT MEMBER", `mapped=${mapped.membershipLevel}`);
  assert(membershipDisplayLabel(mapped.membershipLevel, "th") === "UAT MEMBER", "custom name must not be translated");
});

check("DTO: real Standard member stays Standard", () => {
  const mapped = mapPrismaCustomer({
    customerCode: "MEM-000003",
    fullName: "Standard Member",
    membershipLevel: { name: "Standard" },
    membershipLevelId: "lvl-standard",
    phone: "02055551603",
    pointsBalance: 0,
    status: "active",
  });
  assert(mapped.membershipLevel === "Standard", `mapped=${mapped.membershipLevel}`);
  const level = mapPrismaMembershipLevel({ discountPercent: 0, id: "lvl-standard", minSpendLak: 0, name: "Standard" });
  assert(level.name === "Standard", `level=${level.name}`);
});

check("Code allocator is MAX(MEM-*) + 1 and keeps prefix", () => {
  assert(nextCustomerCode([]) === "MEM-000001", nextCustomerCode([]));
  assert(nextCustomerCode(["MEM-000001", "CUS-9", "MEM-000007"]) === "MEM-000008", nextCustomerCode(["MEM-000001", "MEM-000007"]));
  assert(formatCustomerCode(1) === "MEM-000001", formatCustomerCode(1));
  assert(CUSTOMER_CODE_PREFIX === "MEM-", CUSTOMER_CODE_PREFIX);
});

check("Unique-collision detector matches code constraint only", () => {
  assert(
    isCustomerCodeUniqueCollision({
      code: "P2002",
      meta: { target: ["company_id", "customer_code"] },
      message: "Unique constraint failed",
    }),
    "P2002 customer_code",
  );
  assert(
    !isCustomerCodeUniqueCollision({
      code: "P2002",
      meta: { target: ["company_id", "phone"] },
      message: "Unique constraint failed",
    }),
    "phone unique must not retry as code",
  );
});

await checkAsync("Legacy MAX+1 without lock races to the same candidate / P2002", async () => {
  const { company, tenant } = await createOwnerTenant("legacy-race");
  const proposed = await Promise.all(
    Array.from({ length: 12 }, async () => {
      const rows = await prisma.customer.findMany({
        select: { customerCode: true },
        where: { companyId: company.id, customerCode: { startsWith: "MEM-" } },
      });
      return nextCustomerCode(rows.map((row) => row.customerCode));
    }),
  );
  const uniqueProposed = new Set(proposed);
  assert(uniqueProposed.size === 1, `legacy candidates=${[...uniqueProposed].join(",")}`);
  assert(proposed[0] === "MEM-000001", `legacy first=${proposed[0]}`);

  const settled = await Promise.allSettled(
    proposed.map((code, index) =>
      prisma.customer.create({
        data: {
          branchId: tenant.branchId,
          companyId: company.id,
          customerCode: code,
          fullName: `Legacy Race ${index}`,
          phone: `02017${String(index).padStart(6, "0")}`,
          qrMemberCode: code,
        },
      }),
    ),
  );
  const ok = settled.filter((row) => row.status === "fulfilled").length;
  const collisions = settled.filter((row) => row.status === "rejected").length;
  assert(ok === 1, `legacy successful creates=${ok}`);
  assert(collisions >= 1, `legacy collisions=${collisions}`);
  const firstReject = settled.find((row) => row.status === "rejected") as PromiseRejectedResult | undefined;
  assert(isCustomerCodeUniqueCollision(firstReject?.reason) || /unique/i.test(String(firstReject?.reason)), "legacy reject is unique collision");
});

const displayTenant = await createOwnerTenant("display");
const customLevel = await prisma.membershipLevel.create({
  data: {
    companyId: displayTenant.company.id,
    discountPercent: 5,
    isActive: true,
    minSpendLak: 1,
    name: "UAT MEMBER",
  },
});
const standardLevel = await prisma.membershipLevel.create({
  data: {
    companyId: displayTenant.company.id,
    discountPercent: 0,
    isActive: true,
    minSpendLak: 0,
    name: "Standard",
  },
});

await checkAsync("Local null-level customer displays No Membership", async () => {
  const created = await createPrismaCustomer(
    { fullName: "FIX17 Walk-in", phone: "02055551701", notes: "no membership" },
    displayTenant.tenant,
  );
  assert(created.membershipLevelId == null, `levelId=${created.membershipLevelId}`);
  assert(created.customerCode === "MEM-000001", `code=${created.customerCode}`);
  const snapshot = await getPrismaCustomersSnapshot(displayTenant.tenant);
  const row = snapshot.customers.find((item: { id: string }) => item.id === created.id);
  assert(row?.membershipLevel === null, `dto=${row?.membershipLevel}`);
  assert(membershipDisplayLabel(row?.membershipLevel, "en") === "No Membership", "list label");
});

await checkAsync("Local custom level customer displays UAT MEMBER", async () => {
  const created = await createPrismaCustomer(
    { fullName: "FIX17 Custom", membershipLevelId: customLevel.id, phone: "02055551702" },
    displayTenant.tenant,
  );
  const snapshot = await getPrismaCustomersSnapshot(displayTenant.tenant);
  const row = snapshot.customers.find((item: { id: string }) => item.id === created.id);
  assert(row?.membershipLevel === "UAT MEMBER", `dto=${row?.membershipLevel}`);
});

await checkAsync("Local Standard member displays Standard", async () => {
  const created = await createPrismaCustomer(
    { fullName: "FIX17 Standard", membershipLevelId: standardLevel.id, phone: "02055551703" },
    displayTenant.tenant,
  );
  const snapshot = await getPrismaCustomersSnapshot(displayTenant.tenant);
  const row = snapshot.customers.find((item: { id: string }) => item.id === created.id);
  assert(row?.membershipLevel === "Standard", `dto=${row?.membershipLevel}`);
});

await checkAsync("Existing MEM-000001 remains searchable / POS attachable", async () => {
  const snapshot = await getPrismaCustomersSnapshot(displayTenant.tenant);
  const byCode = snapshot.customers.find((item: { customerCode: string }) => item.customerCode === "MEM-000001");
  assert(byCode?.fullName === "FIX17 Walk-in", `list=${byCode?.fullName}`);
  const pos = await getPrismaPosSnapshot(displayTenant.tenant);
  const hit = posLookup(pos.customers as Array<Record<string, any>>, "MEM-000001");
  assert(hit?.name === "FIX17 Walk-in", `pos=${hit?.name}`);
});

await checkAsync("POS: no-member attach has no fake discount", async () => {
  const walkIn = await prisma.customer.findFirstOrThrow({
    include: { membershipLevel: true, subscriptions: true },
    where: { companyId: displayTenant.company.id, phone: "02055551701" },
  });
  const pos = mapPrismaPosCustomer(walkIn);
  assert(pos.membershipStatus === "Expired", `status=${pos.membershipStatus}`);
  assert(!pos.discountPercent, `discount=${pos.discountPercent}`);
  assert(resolveMembershipDiscountPercent(walkIn) === 0, "loyalty discount");
  assert(isMembershipEligibleForBenefits(walkIn) === false, "benefits");
});

await checkAsync("POS: real member attach keeps member discount", async () => {
  const member = await prisma.customer.findFirstOrThrow({
    include: { membershipLevel: true, subscriptions: true },
    where: { companyId: displayTenant.company.id, phone: "02055551702" },
  });
  const pos = mapPrismaPosCustomer(member);
  assert(pos.membershipStatus === "Active", `status=${pos.membershipStatus}`);
  assert(pos.discountPercent === 5, `discount=${pos.discountPercent}`);
  assert(resolveMembershipDiscountPercent(member) === 5, "loyalty discount");
  const posSnap = await getPrismaPosSnapshot(displayTenant.tenant);
  assert(posLookup(posSnap.customers as Array<Record<string, any>>, "FIX17 Custom"), "name lookup");
  assert(posLookup(posSnap.customers as Array<Record<string, any>>, "02055551702"), "phone lookup");
  assert(posLookup(posSnap.customers as Array<Record<string, any>>, String(member.customerCode)), "code lookup");
});

await checkAsync("Requested duplicate code is rejected and unique constraint stays", async () => {
  let rejected = false;
  try {
    await createPrismaCustomer(
      { customerCode: "MEM-000001", fullName: "Dup Code", phone: "02055551799" },
      displayTenant.tenant,
    );
  } catch (error) {
    rejected = isCustomerCodeUniqueCollision(error) || /unique/i.test(String(error));
  }
  assert(rejected, "duplicate explicit code must fail");
});

const parallelTenant = await createOwnerTenant("parallel");
await checkAsync("20 concurrent auto-creates succeed with unique codes", async () => {
  const settled = await Promise.allSettled(
    Array.from({ length: 20 }, (_, index) =>
      createPrismaCustomer(
        { fullName: `FIX17 Parallel ${index + 1}`, phone: `02018${String(index).padStart(6, "0")}` },
        parallelTenant.tenant,
      ),
    ),
  );
  const failures = settled.filter((row) => row.status === "rejected") as PromiseRejectedResult[];
  const created = settled
    .filter((row) => row.status === "fulfilled")
    .map((row) => (row as PromiseFulfilledResult<{ customerCode: string | null; companyId: string }>).value);
  const codes = created.map((row) => String(row.customerCode));
  const unique = new Set(codes);
  const surfaced = failures.filter((row) => isCustomerCodeUniqueCollision(row.reason)).length;
  assert(created.length === 20, `successful=${created.length} failures=${failures.map((row) => row.reason).join(" | ")}`);
  assert(unique.size === 20, `unique=${unique.size} codes=${codes.join(",")}`);
  assert(surfaced === 0, `P2002 surfaced=${surfaced}`);
  assert(created.every((row) => row.companyId === parallelTenant.company.id), "tenant ownership");
  assert(codes.every((code) => /^MEM-\d{6}$/.test(code)), "code format");
  console.log(`  codes ${codes.slice().sort().join(", ")}`);
});

const tenantA = await createOwnerTenant("cross-a");
const tenantB = await createOwnerTenant("cross-b");
await checkAsync("Cross-tenant concurrent creates stay isolated", async () => {
  const [aSettled, bSettled] = await Promise.all([
    Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createPrismaCustomer({ fullName: `FIX17 A ${index}`, phone: `02019${String(index).padStart(6, "0")}` }, tenantA.tenant),
      ),
    ),
    Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createPrismaCustomer({ fullName: `FIX17 B ${index}`, phone: `02020${String(index).padStart(6, "0")}` }, tenantB.tenant),
      ),
    ),
  ]);
  const aIds = new Set(aSettled.map((row) => row.companyId));
  const bIds = new Set(bSettled.map((row) => row.companyId));
  assert(aIds.size === 1 && aIds.has(tenantA.company.id), "A ownership");
  assert(bIds.size === 1 && bIds.has(tenantB.company.id), "B ownership");
  const aCodes = aSettled.map((row) => String(row.customerCode));
  const bCodes = bSettled.map((row) => String(row.customerCode));
  assert(new Set(aCodes).size === 5 && new Set(bCodes).size === 5, "per-tenant unique");
  const leakedA = await prisma.customer.count({
    where: { companyId: tenantA.company.id, id: { in: bSettled.map((row) => row.id) } },
  });
  const leakedB = await prisma.customer.count({
    where: { companyId: tenantB.company.id, id: { in: aSettled.map((row) => row.id) } },
  });
  assert(leakedA === 0 && leakedB === 0, "no tenant leakage");
});

await checkAsync("Unauthorized cashier cannot create customers", async () => {
  const cashier = await prisma.user.create({
    data: { fullName: "FIX-17 Cashier", passwordHash: "isolated-fixture", username: `f17c${randomBytes(3).toString("hex")}` },
  });
  await prisma.companyUser.create({
    data: {
      branchId: displayTenant.branch.id,
      companyId: displayTenant.company.id,
      isOwner: false,
      status: "active",
      userId: cashier.id,
    },
  });
  let blocked = false;
  try {
    await assertPermission(
      { branchId: displayTenant.branch.id, companyId: displayTenant.company.id, userId: cashier.id },
      WRITE_PERMISSIONS.customersCreate,
    );
  } catch {
    blocked = true;
  }
  assert(blocked, "cashier create must be blocked");
});

const failed = results.filter((row) => row.status === "FAIL");
await prisma.$disconnect();
if (failed.length) {
  console.error(JSON.stringify({ failed: failed.length, results }, null, 2));
  process.exit(1);
}
console.log("FIX-17 customer/membership check PASS");
