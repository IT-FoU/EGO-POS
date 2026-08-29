import { readFileSync } from "node:fs";
import { createPosPermissionPolicyFromDatabase } from "../features/access-control/pos-policy-loader";
import { getOpenCashSession } from "../features/cash-sessions/prisma-repository";
import { taxAndLoyaltyFromSettingsRow } from "../features/settings/prisma-repository";
import type { BranchScope } from "../lib/db/tenant-scope";
import type { TenantContext } from "../lib/db/write-context";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const tenant: TenantContext = {
  branchId: "branch-1",
  companyId: "company-1",
  userId: "user-1",
  warehouseId: "warehouse-1",
};

const scope: BranchScope = {
  ...tenant,
  branchIds: ["branch-1"],
  branchName: "Main Warehouse Branch",
  isOwner: true,
  warehouseIds: ["warehouse-1"],
};

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function createPolicyClient(options: { isOwner: boolean; permissionKeys?: string[] }) {
  const calls: string[] = [];
  const client = {
    calls,
    approval: { findMany: async () => { calls.push("approval"); return []; } },
    approvalRule: {
      findMany: async () => {
        calls.push("approvalRule");
        return [
          { approverRole: "owner", id: "rule-discount", isEnabled: true, ruleKey: "discount", thresholdPercent: 10 },
          { approverRole: "owner", id: "rule-refund", isEnabled: true, ruleKey: "refund", thresholdLak: 100000 },
        ];
      },
    },
    branch: { findMany: async () => { calls.push("branch"); return []; } },
    companyUser: {
      findFirst: async () => {
        calls.push("companyUser.findFirst");
        return { isOwner: options.isOwner };
      },
      findMany: async () => { calls.push("companyUser.findMany"); return []; },
    },
    role: { findMany: async () => { calls.push("role"); return []; } },
    rolePermission: { findMany: async () => { calls.push("rolePermission"); return []; } },
    userRole: {
      findMany: async () => {
        calls.push("userRole");
        return (options.permissionKeys ?? []).map((key) => ({
          role: { permissions: [{ permission: { key } }] },
        }));
      },
    },
  };
  return client;
}

const ownerClient = createPolicyClient({ isOwner: true });
const ownerPolicy = await createPosPermissionPolicyFromDatabase({
  client: ownerClient,
  displayName: "GO BOX Owner",
  roles: ["Owner"],
  tenant,
  userId: tenant.userId,
  username: "gobox",
});
check("Owner policy uses DB membership, not hardcoded skip of keys", ownerClient.calls.includes("companyUser.findFirst"));
check("Owner POS paint does not load staff matrix", !ownerClient.calls.includes("companyUser.findMany"));
check("Owner POS paint does not load roles/pending/branches", !ownerClient.calls.includes("role") && !ownerClient.calls.includes("approval") && !ownerClient.calls.includes("branch"));
check("Owner POS paint loads approval rules in parallel", ownerClient.calls.includes("approvalRule"));
check("Owner permissions are unrestricted", ownerPolicy.permissions.create_sale === true && ownerPolicy.permissions.void_bill === true);
check("Owner approval overlay is empty", Object.keys(ownerPolicy.approvalRules).length === 0);
check("Owner max discount is 100", ownerPolicy.maxDiscountPercent === 100);

const cashierClient = createPolicyClient({ isOwner: false, permissionKeys: ["pos.create", "pos.sell"] });
const cashierPolicy = await createPosPermissionPolicyFromDatabase({
  client: cashierClient,
  displayName: "Cashier",
  roles: ["Cashier"],
  tenant,
  userId: "cashier-1",
  username: "cashier",
});
check("Cashier policy reads assigned role permissions", cashierClient.calls.includes("userRole"));
check("Cashier can create sale from pos.create", cashierPolicy.permissions.create_sale === true);
check("Cashier cannot void without pos.delete/approve", cashierPolicy.permissions.void_bill === false);
check("Cashier discount ceiling is the company threshold", cashierPolicy.maxDiscountPercent === 0);
check("Cashier still does not load staff matrix", !cashierClient.calls.includes("companyUser.findMany") && !cashierClient.calls.includes("rolePermission"));

const managerClient = createPolicyClient({ isOwner: false, permissionKeys: ["pos.create", "pos.edit", "pos.approve"] });
const managerPolicy = await createPosPermissionPolicyFromDatabase({
  client: managerClient,
  displayName: "Manager",
  roles: ["Manager"],
  tenant,
  userId: "manager-1",
  username: "manager",
});
check("Manager discount ceiling uses approval rule", managerPolicy.maxDiscountPercent === 10);
check("Manager refund approval uses company rule", managerPolicy.approvalRules.refund_bill === "owner_above_threshold");

const tax = taxAndLoyaltyFromSettingsRow({
  loyaltyEnabled: false,
  loyaltyMinRedeemPoints: 5,
  loyaltyPointValueLak: 2000,
  loyaltySpendPerPointLak: 15000,
  taxInclusive: true,
  vatEnabled: true,
  vatRate: 10,
});
check("Tax mapping reuses in-memory settings", tax.taxInclusive === true && tax.vatRate === 10 && tax.loyaltyEnabled === false);
check("Tax mapping defaults when settings missing", taxAndLoyaltyFromSettingsRow(null).vatRate === 0);

const cashCalls: string[] = [];
const cashClient = {
  branch: {
    findFirst: async () => {
      cashCalls.push("branch");
      throw new Error("resolveTenantScope must not run when scope is provided");
    },
  },
  cashSession: {
    findFirst: async (args: { where: { branchId: string; cashierId: string; companyId: string } }) => {
      cashCalls.push("cashSession");
      assert(args.where.branchId === scope.branchId, "cash session must use resolved branch");
      assert(args.where.cashierId === tenant.userId, "cash session must stay owned by the cashier user");
      assert(args.where.companyId === tenant.companyId, "cash session must stay tenant-scoped");
      return null;
    },
  },
  companyUser: {
    findFirst: async () => {
      cashCalls.push("companyUser");
      throw new Error("resolveTenantScope must not run when scope is provided");
    },
  },
  warehouse: {
    findMany: async () => {
      cashCalls.push("warehouse");
      throw new Error("resolveTenantScope must not run when scope is provided");
    },
  },
};

const openSession = await getOpenCashSession(tenant, { client: cashClient, scope });
check("Passed scope skips a second tenant lookup", !cashCalls.includes("branch") && !cashCalls.includes("companyUser") && !cashCalls.includes("warehouse"));
check("Cash session remains a fresh read", cashCalls.includes("cashSession") && openSession === null);

const foreignScope: BranchScope = { ...scope, branchId: "other-branch", branchIds: ["other-branch"] };
await getOpenCashSession(tenant, {
  client: {
    ...cashClient,
    cashSession: {
      findFirst: async (args: { where: { branchId: string } }) => {
        assert(args.where.branchId === "other-branch", "warehouse/branch isolation must follow provided scope");
        return null;
      },
    },
  },
  scope: foreignScope,
});
check("Warehouse/branch isolation follows the provided request scope", true);

const posPage = readFileSync(new URL("../app/(dashboard)/pos/page.tsx", import.meta.url), "utf8");
const posSnapshot = readFileSync(new URL("../features/pos/prisma-repository.ts", import.meta.url), "utf8");
const posClient = readFileSync(new URL("../features/pos/components/pos-page-client.tsx", import.meta.url), "utf8");
check("POS page loads snapshot and policy in parallel", posPage.includes("Promise.all") && posPage.includes("getPosSnapshot()") && posPage.includes("createPosPermissionPolicyFromDatabase"));
check("POS snapshot reuses open cash-session scope", posSnapshot.includes("getOpenCashSession(tenant, { scope })"));
check("POS snapshot does not re-read tax settings from a second query", !posSnapshot.includes("getPrismaTaxAndLoyaltySettings"));
check("Held/recent sales are not fetched on POS mount", !posClient.includes("void refreshRecentSalesFromServer();\n        void refreshHeldBillsFromServer();"));
check("Checkout/sale writer is unchanged in this file set", posSnapshot.includes("export async function completePrismaSale"));

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\nPERF-02 loader checks failed: ${failed.length}`);
  process.exit(1);
}
console.log(`\nPERF-02 loader checks passed: ${results.length}`);
