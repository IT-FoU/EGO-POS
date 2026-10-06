/**
 * STEP 4D — dedicated POS Quick Stock Fix permission.
 * Run: npx tsx scripts/phase-products-step4d-quick-stock-fix-permission-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { permissionKeysForDraft, recommendedRoleDraft } from "../features/access-control/role-permission-v2";
import { STORE_ACTIONS, hasStorePermission } from "../features/permissions/store-permissions";
import { canUseQuickStockFix, POS_QUICK_STOCK_FIX_PERMISSION } from "../features/pos/quick-stock-fix";
import { createPosPermissionPolicy } from "../features/pos/permissions";
import { WRITE_PERMISSIONS } from "../lib/auth/permissions";
import { settingsCopyKeyParity, tSettings } from "../lib/i18n/settings-copy";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const actions = read("features/inventory/actions.ts");
const repo = read("features/inventory/prisma-repository.ts");
const page = read("features/pos/components/pos-page-client.tsx");
const route = read("app/api/inventory/adjustment/route.ts");
const productEdit = read("app/(dashboard)/products/[productId]/edit/page.tsx");
const catalog = read("features/access-control/permission-catalog.ts");
const roles = read("features/access-control/role-permission-v2.ts");
const auth = read("lib/auth/quick-stock-fix-permission.ts");
const panel = read("features/settings/components/role-permissions-panel.tsx");

check("permission key is pos.quick_stock_fix", WRITE_PERMISSIONS.posQuickStockFix === POS_QUICK_STOCK_FIX_PERMISSION);
check("catalog lists the new key", catalog.includes('"pos.quick_stock_fix"'));
check("roles UI places it under POS", roles.includes('perm("pos.quickStockFix", "permQuickStockFix", ["pos.quick_stock_fix"]'));
check("roles help copy is wired", roles.includes("permQuickStockFixHelp") && panel.includes("item.helpKey"));

check("owner wildcard can Quick Stock Fix", canUseQuickStockFix(["*"]));
check("inventory.adjust can Quick Stock Fix", canUseQuickStockFix(["inventory.adjust"]));
check("pos.quick_stock_fix can Quick Stock Fix", canUseQuickStockFix(["pos.quick_stock_fix"]));
check("both keys can Quick Stock Fix", canUseQuickStockFix(["pos.quick_stock_fix", "inventory.adjust"]));
check("neither key cannot Quick Stock Fix", !canUseQuickStockFix(["pos.sell", "pos.create"]));
check("pos.quick_stock_fix does not imply inventory.adjust", !hasStorePermission("cashier", STORE_ACTIONS.INVENTORY_ADJUST));

const cashierDraft = recommendedRoleDraft("Staff/Cashier");
const cashierSaved = permissionKeysForDraft(cashierDraft, ["pos.view", "pos.create", "pos.print"]);
check("cashier default draft leaves Quick Stock Fix off", cashierDraft.pos.advanced["pos.quickStockFix"] !== true);
check("cashier default save omits pos.quick_stock_fix", !cashierSaved.includes("pos.quick_stock_fix"));
check("cashier default save omits inventory.adjust", !cashierSaved.includes("inventory.adjust"));

const ownerPolicy = createPosPermissionPolicy({ roles: ["Owner"] });
const managerPolicy = createPosPermissionPolicy({ roles: ["Manager"] });
const cashierPolicy = createPosPermissionPolicy({ roles: ["Cashier"] });
check("demo owner can Quick Stock Fix", ownerPolicy.canQuickStockFix === true);
check("demo manager can Quick Stock Fix via inventory.adjust role", managerPolicy.canQuickStockFix === true);
check("demo cashier cannot Quick Stock Fix until granted", cashierPolicy.canQuickStockFix === false);

const quick = actions.slice(actions.indexOf("export async function quickStockFixAction"), actions.indexOf("export async function stockCountAction"));
const adjust = actions.slice(actions.indexOf("export async function stockAdjustmentAction"), actions.indexOf("export async function quickStockFixAction"));
const productAdjust = actions.slice(actions.indexOf("export async function adjustProductStockAction"));
const adjustmentFn = repo.slice(repo.indexOf("export async function createStockAdjustment"), repo.indexOf("export async function createStockCount"));

check("Quick Stock Fix uses dedicated auth helper", quick.includes("assertQuickStockFixPermission") && auth.includes("WRITE_PERMISSIONS.posQuickStockFix") && auth.includes("WRITE_PERMISSIONS.inventoryAdjust"));
check("Quick Stock Fix does not require inventory.adjust store action", !quick.includes("STORE_ACTIONS.INVENTORY_ADJUST"));
check("generic stockAdjustmentAction still requires inventory.adjust", adjust.includes("WRITE_PERMISSIONS.inventoryAdjust") && adjust.includes("STORE_ACTIONS.INVENTORY_ADJUST"));
check("product edit adjust still requires inventory.adjust", productAdjust.includes("WRITE_PERMISSIONS.inventoryAdjust") && productEdit.includes("STORE_ACTIONS.INVENTORY_ADJUST"));
check("generic adjustment API still requires inventory.adjust", route.includes("WRITE_PERMISSIONS.inventoryAdjust") && route.includes("STORE_ACTIONS.INVENTORY_ADJUST"));
check("generic adjustment keeps the approval rule", adjustmentFn.includes("assertConfiguredApprovalSatisfied") && adjustmentFn.includes('ruleKey: "stock_adjustment"'));
check("POS Quick Stock Fix skips the generic approval rule only", adjustmentFn.includes('options?.source !== "pos_quick_stock_fix"') && quick.includes('source: "pos_quick_stock_fix"'));
check("POS UI uses the dedicated capability flag", page.includes("posPermissionPolicy.canQuickStockFix"));
check("audit records the POS Quick Stock Fix source", repo.includes("source: options?.source") && repo.includes("pos_quick_stock_fix"));

check("EN/LO permission label", tSettings("permQuickStockFix", "en") === "Quick Stock Fix" && tSettings("permQuickStockFix", "lo") === "ແກ້ສະຕັອກດ່ວນ");
check("EN/LO permission help", tSettings("permQuickStockFixHelp", "en").includes("temporary stock correction") && tSettings("permQuickStockFixHelp", "lo").includes("ແກ້ສະຕັອກ") && !/[A-Za-z]/.test(tSettings("permQuickStockFixHelp", "lo").replace(/0/g, "")));
check("settings copy parity", settingsCopyKeyParity());

if (failed > 0) {
  console.error(`\nSTEP 4D Quick Stock Fix permission: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\nSTEP 4D Quick Stock Fix permission: ${passed} passed, 0 failed`);
