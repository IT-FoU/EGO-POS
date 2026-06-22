import { existsSync, readFileSync } from "node:fs";

// Force production writes BEFORE loading env files (loader only sets unset keys).
process.env.IGO_DEMO_MODE = "false";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { createApprovalRequest, decideApprovalRequest, evaluateApprovalRequirement } = await import("../features/approvals/approval-engine");
const { assertPermission, WRITE_PERMISSIONS } = await import("../lib/auth/permissions");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}
async function balanceOf(productId: string) {
  const row = await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } });
  return row ? Number(row.quantity) : 0;
}
async function auditCount(action: string) {
  return prisma.auditLog.count({ where: { action, companyId: COMPANY_ID, module: "approvals" } });
}
async function setStockAdjustmentApprover(approverRole: "owner" | "manager") {
  await prisma.approvalRule.upsert({
    create: { approverRole, companyId: COMPANY_ID, isEnabled: true, ruleKey: "stock_adjustment" },
    update: { approverRole, isEnabled: true },
    where: { companyId_ruleKey: { companyId: COMPANY_ID, ruleKey: "stock_adjustment" } },
  });
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users (igo-admin / manager / cashier). Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: "foreign-branch", companyId: "foreign-company", userId: ownerUser.id, warehouseId: "foreign-warehouse" };

// Test product with known stock.
const PRODUCT = "b82-test-product";
const UNIT = "b82-test-unit";
await prisma.product.upsert({
  create: { branchId: BRANCH_ID, companyId: COMPANY_ID, costPriceLak: 5000, id: PRODUCT, isActive: true, nameEn: "B8-2 Product", nameLo: "B8-2 Product", sellingPriceLak: 9000 },
  update: { isActive: true },
  where: { id: PRODUCT },
});
await prisma.productUnit.upsert({
  create: { conversionQty: 1, costPriceLak: 5000, id: UNIT, isBaseUnit: true, isDefaultSaleUnit: true, productId: PRODUCT, sellingPriceLak: 9000, status: "active", unitName: "Piece" },
  update: { status: "active" },
  where: { id: UNIT },
});
const existingBalance = await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT, warehouseId: WAREHOUSE_ID } });
if (existingBalance) {
  await prisma.inventoryBalance.update({ data: { quantity: 1000 }, where: { id: existingBalance.id } });
} else {
  await prisma.inventoryBalance.create({ data: { companyId: COMPANY_ID, productId: PRODUCT, quantity: 1000, warehouseId: WAREHOUSE_ID } });
}

function stockAdjustmentRequest(quantity: number, reason: string) {
  return {
    action: "stock_adjustment",
    amountLak: Math.abs(quantity) * 5000,
    module: "inventory",
    payload: { adjustmentType: "adjustment", productId: PRODUCT, quantity, reason, warehouseId: WAREHOUSE_ID },
    reason,
    referenceId: PRODUCT,
    ruleKey: "stock_adjustment" as const,
  };
}

// ---- Permission layer (enforced by actions/API via assertPermission) ----
await expectThrow("Requester permission: cashier lacks inventory.adjust", () =>
  assertPermission(cashierTenant, WRITE_PERMISSIONS.inventoryAdjust));
check("Approver permission: manager has approvals.approve", await assertPermission(managerTenant, WRITE_PERMISSIONS.approvalsManage).then(() => true).catch(() => false));
await expectThrow("Approver permission: cashier lacks approvals.approve", () =>
  assertPermission(cashierTenant, WRITE_PERMISSIONS.approvalsManage));

// ---- Threshold evaluation ----
check("evaluateApprovalRequirement: disabled rule => not required", evaluateApprovalRequirement({ isEnabled: false, thresholdLak: 1 }, { amountLak: 5 }) === false);
check("evaluateApprovalRequirement: amount over threshold => required", evaluateApprovalRequirement({ isEnabled: true, thresholdLak: 100000 }, { amountLak: 150000 }) === true);
check("evaluateApprovalRequirement: amount under threshold => not required", evaluateApprovalRequirement({ isEnabled: true, thresholdLak: 100000 }, { amountLak: 50000 }) === false);
check("evaluateApprovalRequirement: percent over threshold => required", evaluateApprovalRequirement({ isEnabled: true, thresholdPercent: 10 }, { discountPercent: 25 }) === true);

// ---- Create / Reject / Approve lifecycle (DB-backed, executed on approve) ----
await setStockAdjustmentApprover("manager");

// Create (cashier requests +50 stock adjustment). Stock must NOT change yet.
const createAuditBefore = await auditCount("create");
const balanceBeforeCreate = await balanceOf(PRODUCT);
const request: any = await createApprovalRequest(stockAdjustmentRequest(50, "Cycle count surplus"), cashierTenant);
check("Create approval request returns pending", request.status === "pending", `status=${request.status}`);
check("Create: requestedByRole captured = cashier", request.requestedByRole === "cashier", `role=${request.requestedByRole}`);
check("Create: stock unchanged before approval", await balanceOf(PRODUCT) === balanceBeforeCreate, `before=${balanceBeforeCreate}, now=${await balanceOf(PRODUCT)}`);
check("Create: audit log 'create' written", (await auditCount("create")) === createAuditBefore + 1, `before=${createAuditBefore}, after=${await auditCount("create")}`);

// Reject path: a separate request rejected by manager -> no execution.
const rejectReq: any = await createApprovalRequest(stockAdjustmentRequest(30, "To be rejected"), cashierTenant);
const balanceBeforeReject = await balanceOf(PRODUCT);
const rejected: any = await decideApprovalRequest({ approvalId: rejectReq.id, decisionNote: "Not needed", status: "rejected" }, managerTenant);
check("Reject: status rejected", rejected.status === "rejected", `status=${rejected.status}`);
check("Reject: not executed", rejected.executed === false, `executed=${rejected.executed}`);
check("Reject: stock unchanged", await balanceOf(PRODUCT) === balanceBeforeReject, `before=${balanceBeforeReject}, now=${await balanceOf(PRODUCT)}`);
check("Reject: persisted approval status rejected", (await prisma.approval.findUniqueOrThrow({ where: { id: rejectReq.id } })).status === "rejected");

// Self-approval guard: owner creates and tries to decide own request.
const ownReq: any = await createApprovalRequest(stockAdjustmentRequest(10, "Owner self request"), ownerTenant);
await expectThrow("Self-approval blocked (owner cannot decide own request)", () =>
  decideApprovalRequest({ approvalId: ownReq.id, status: "approved" }, ownerTenant));

// Cashier cannot approve (role blocked even before permission layer).
const cashierBlockReq: any = await createApprovalRequest(stockAdjustmentRequest(10, "Cashier approve attempt"), managerTenant);
await expectThrow("Cashier blocked from approving (role)", () =>
  decideApprovalRequest({ approvalId: cashierBlockReq.id, status: "approved" }, cashierTenant));
check("Cashier-blocked request still pending", (await prisma.approval.findUniqueOrThrow({ where: { id: cashierBlockReq.id } })).status === "pending");

// Cross-company isolation: foreign tenant cannot decide this company's approval.
await expectThrow("Cross-company decide blocked (not found)", () =>
  decideApprovalRequest({ approvalId: cashierBlockReq.id, status: "approved" }, foreignTenant));

// Approve + execute: manager approves the cashier's +50 request -> stock increases.
const approveAuditBefore = await auditCount("approved");
const balanceBeforeApprove = await balanceOf(PRODUCT);
const approved: any = await decideApprovalRequest({ approvalId: request.id, decisionNote: "Verified", status: "approved" }, managerTenant);
check("Approve: status approved", approved.status === "approved", `status=${approved.status}`);
check("Approve: executed flag true", approved.executed === true, `executed=${approved.executed}, detail=${approved.executionDetail}`);
check("Approve: stock increased by 50", await balanceOf(PRODUCT) === balanceBeforeApprove + 50, `before=${balanceBeforeApprove}, now=${await balanceOf(PRODUCT)}`);
check("Approve: StockMovement (adjustment) row created", (await prisma.stockMovement.count({ where: { companyId: COMPANY_ID, referenceId: request.id, referenceType: "approval" } })) === 1);
check("Approve: StockAdjustment row created with approver", (await prisma.stockAdjustment.count({ where: { approvedBy: managerUser.id, companyId: COMPANY_ID, productId: PRODUCT } })) >= 1);
check("Approve: audit log 'approved' written", (await auditCount("approved")) === approveAuditBefore + 1, `before=${approveAuditBefore}, after=${await auditCount("approved")}`);
await expectThrow("Re-deciding a decided approval is rejected", () =>
  decideApprovalRequest({ approvalId: request.id, status: "approved" }, managerTenant));

// Owner-only rule: manager blocked, owner allowed.
await setStockAdjustmentApprover("owner");
const ownerOnlyReq: any = await createApprovalRequest(stockAdjustmentRequest(5, "Owner-only rule"), cashierTenant);
await expectThrow("Owner-only rule blocks manager approver", () =>
  decideApprovalRequest({ approvalId: ownerOnlyReq.id, status: "approved" }, managerTenant));
const balanceBeforeOwnerApprove = await balanceOf(PRODUCT);
const ownerApproved: any = await decideApprovalRequest({ approvalId: ownerOnlyReq.id, status: "approved" }, ownerTenant);
check("Owner approves owner-only rule", ownerApproved.status === "approved" && ownerApproved.executed === true, `status=${ownerApproved.status}, executed=${ownerApproved.executed}`);
check("Owner approval executed (+5 stock)", await balanceOf(PRODUCT) === balanceBeforeOwnerApprove + 5, `before=${balanceBeforeOwnerApprove}, now=${await balanceOf(PRODUCT)}`);

// Restore default approver role for the rule (manager-friendly default left as owner per seed).
await setStockAdjustmentApprover("owner");

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB8-2 approval: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
