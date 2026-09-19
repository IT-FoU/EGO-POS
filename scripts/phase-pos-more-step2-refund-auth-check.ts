import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STORE_ACTIONS, STORE_ROLES, canPerformStoreAction } from "../features/permissions/store-permissions";
import { needsPostSaleManagerPin } from "../features/permissions/store-ui-permissions";
import { isManagerPinApprovalEligible } from "../lib/auth/store-manager-approval";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const root = process.cwd();
const modal = readFileSync(join(root, "features/pos/components/return-exchange-void-modal.tsx"), "utf8");
const client = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const postSaleClient = readFileSync(join(root, "features/pos/post-sale-client.ts"), "utf8");
const approval = readFileSync(join(root, "lib/auth/store-manager-approval.ts"), "utf8");
const writeResponse = readFileSync(join(root, "lib/api/write-response.ts"), "utf8");
const returnRoute = readFileSync(join(root, "app/api/pos/sales/[id]/return/route.ts"), "utf8");
const exchangeRoute = readFileSync(join(root, "app/api/pos/sales/[id]/exchange/route.ts"), "utf8");
const voidRoute = readFileSync(join(root, "app/api/pos/sales/[id]/void/route.ts"), "utf8");
const returnRepo = readFileSync(join(root, "features/pos/return-repository.ts"), "utf8");
const postSaleRepo = readFileSync(join(root, "features/pos/post-sale-repository.ts"), "utf8");
const cashSessionRepo = readFileSync(join(root, "features/cash-sessions/prisma-repository.ts"), "utf8");
const copy = readFileSync(join(root, "lib/i18n/pos-copy.ts"), "utf8");
const smallModal = readFileSync(join(root, "features/pos/components/pos-small-modal.tsx"), "utf8");
const workspace = readFileSync(join(root, "features/pos/components/pos-workspace-modal.tsx"), "utf8");

check("1. OWNER authorized Return/Exchange/Void do not need Manager PIN", () => {
  assert(!needsPostSaleManagerPin(STORE_ROLES.OWNER, "return"), "owner return");
  assert(!needsPostSaleManagerPin(STORE_ROLES.OWNER, "exchange"), "owner exchange");
  assert(!needsPostSaleManagerPin(STORE_ROLES.OWNER, "void"), "owner void");
  assert(canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.SALE_REFUND), "owner refund");
  assert(canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.SALE_VOID), "owner void");
});

check("2. MANAGER authorized Return/Exchange/Void follow matrix (no PIN)", () => {
  assert(!needsPostSaleManagerPin(STORE_ROLES.MANAGER, "return"), "manager return");
  assert(!needsPostSaleManagerPin(STORE_ROLES.MANAGER, "exchange"), "manager exchange");
  assert(!needsPostSaleManagerPin(STORE_ROLES.MANAGER, "void"), "manager void");
  assert(canPerformStoreAction({ role: STORE_ROLES.MANAGER }, STORE_ACTIONS.SALE_REFUND), "manager refund");
  assert(canPerformStoreAction({ role: STORE_ROLES.MANAGER }, STORE_ACTIONS.SALE_VOID), "manager void");
});

check("3. CASHIER protected Return/Exchange/Void require PIN prompt", () => {
  assert(needsPostSaleManagerPin(STORE_ROLES.CASHIER, "return"), "cashier return");
  assert(needsPostSaleManagerPin(STORE_ROLES.CASHIER, "exchange"), "cashier exchange");
  assert(needsPostSaleManagerPin(STORE_ROLES.CASHIER, "void"), "cashier void");
  assert(!canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.SALE_REFUND), "cashier no refund");
  assert(!canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.SALE_VOID), "cashier no void");
});

check("4. Canonical API path uses body.approval + __storeManagerPinApproval", () => {
  assert(writeResponse.includes("body.approval as StoreManagerPinApprovalBody"), "write-response approval");
  assert(writeResponse.includes("STORE_MANAGER_APPROVAL_BODY_KEY"), "approval body key");
  assert(returnRoute.includes("allowManagerPinApproval: true"), "return PIN gate");
  assert(exchangeRoute.includes("allowManagerPinApproval: true"), "exchange PIN gate");
  assert(voidRoute.includes("allowManagerPinApproval: true"), "void PIN gate");
  assert(returnRoute.includes("managerPinApproval: body.__storeManagerPinApproval"), "return inject");
  assert(exchangeRoute.includes("managerPinApproval: body.__storeManagerPinApproval"), "exchange inject");
  assert(voidRoute.includes("managerPinApproval: body.__storeManagerPinApproval"), "void inject");
  assert(postSaleClient.includes("managerPin: string"), "client payload field");
  assert(postSaleClient.includes("body: JSON.stringify({ ...input, approval })"), "return/exchange send approval");
  assert(postSaleClient.includes("body: JSON.stringify({ approval, reason })"), "void send approval");
});

check("5. Cashier without PIN rejected; wrong PIN rejected; cancel no mutation", () => {
  assert(approval.includes("if (!pin || !reason)"), "missing PIN/reason deny");
  assert(approval.includes("Manager PIN approval failed."), "wrong PIN deny");
  assert(modal.includes("closeApprovalModal"), "cancel closes PIN modal");
  assert(modal.includes("setPendingAction(null)"), "cancel clears pending action");
  assert(modal.includes("needsPostSaleManagerPin(currentRole, action)"), "cashier gated before execute");
  assert(modal.includes("openApprovalModal(action)"), "PIN prompt before API");
});

check("6. Successful PIN sends approval once with submit lock", () => {
  assert(modal.includes("submitLockRef"), "submit lock");
  assert(modal.includes("executeAction(pendingAction, approval)"), "approved execute once");
  assert(modal.includes("clearApprovalPin()"), "PIN cleared after use");
  assert(!modal.includes("localStorage"), "no localStorage PIN");
  assert(!modal.includes("sessionStorage"), "no sessionStorage PIN");
});

check("7. Exchange PIN eligibility ignores cashier-allowed companion actions", () => {
  const exchangeDenied = [STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND];
  const exchangeBundle = [
    STORE_ACTIONS.SALE_REFUND,
    STORE_ACTIONS.PAYMENT_REFUND,
    STORE_ACTIONS.SALE_COMPLETE,
    STORE_ACTIONS.PAYMENT_RECEIVE,
  ];
  assert(isManagerPinApprovalEligible(exchangeDenied), "denied-only eligible");
  assert(!isManagerPinApprovalEligible(exchangeBundle), "raw full bundle still blocked by SALE_COMPLETE");
  assert(approval.includes("deniedActions"), "runtime uses deniedActions");
  assert(approval.includes("isManagerPinApprovalEligible(deniedActions)"), "eligibility on denied only");
});

check("8. Return quantity / duplicate / void guards remain server-side", () => {
  assert(returnRepo.includes("remainingQuantity") || returnRepo.includes("buildPreparedReturnLines"), "return qty guard helper");
  assert(returnRepo.includes("Sale is already voided.") || postSaleRepo.includes("Sale is already voided."), "voided guard");
  assert(postSaleRepo.includes("assertSaleVoidable"), "voidable assert");
  assert(returnRepo.includes("managerPinApproval"), "return approver recorded");
  assert(postSaleRepo.includes("approvedById"), "void approver recorded");
});

check("9. Modal stack: PIN above child; Escape closes PIN first", () => {
  assert(modal.includes('overlayClassName="z-[70]"'), "PIN z-[70]");
  assert(workspace.includes("z-[60]"), "child workspace z-[60]");
  assert(modal.includes("closeOnEscape"), "PIN Escape enabled");
  assert(smallModal.includes("stopImmediatePropagation"), "Escape isolated");
  assert(modal.includes('data-testid="pos-return-exchange-pin-modal"'), "PIN modal marker");
  assert(client.includes("currentRole={posPermissionPolicy.role}"), "role passed into modal");
});

check("10. Error UX keys + unauthorized API 403 mapping", () => {
  assert(copy.includes('"ui.invalid.pin"'), "invalid pin copy");
  assert(copy.includes('"ui.approval.required"'), "approval required copy");
  assert(copy.includes('"ui.permission.denied"'), "permission denied copy");
  assert(copy.includes('"ui.sale.already.voided"'), "already voided copy");
  assert(copy.includes('"ui.quantity.exceeds.returnable"'), "qty copy");
  assert(postSaleClient.includes("response.status === 403"), "403 mapped");
  assert(modal.includes("mapPostSaleError"), "friendly error mapper");
});

check("11. VOID expected-drawer linkage properly derived (STEP 9)", () => {
  assert(cashSessionRepo.includes("voidCashLak"), "voidCashLak present in session repo");
  assert(!cashSessionRepo.includes("voidCashLak: 0"), "voidCashLak no longer hardcoded 0 (STEP 9 fixed)");
});

check("12. More navigation / Favorites / Exact surfaces untouched by this modal rewrite", () => {
  assert(client.includes("function backFromMoreChild"), "More Back intact");
  assert(client.includes("function closeMoreChild"), "More X intact");
  assert(client.includes("setFavoritesOpen"), "Favorites intact");
  assert(client.includes("Exact"), "Exact intact");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\nRESULT  ${failed.length === 0 ? "PASS" : "FAIL"}  ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  process.exitCode = 1;
}
