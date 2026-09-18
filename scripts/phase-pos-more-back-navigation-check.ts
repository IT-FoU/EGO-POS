import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const client = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
  "utf8",
);
const workspace = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-workspace-modal.tsx"),
  "utf8",
);
const ownShift = readFileSync(
  join(process.cwd(), "features", "pos", "components", "own-shift-report-drawer.tsx"),
  "utf8",
);
const cashInOut = readFileSync(
  join(process.cwd(), "features", "pos", "components", "cash-in-out-modal.tsx"),
  "utf8",
);
const returnExchange = readFileSync(
  join(process.cwd(), "features", "pos", "components", "return-exchange-void-modal.tsx"),
  "utf8",
);
const saleOptions = readFileSync(
  join(process.cwd(), "features", "pos", "components", "sale-options-drawer.tsx"),
  "utf8",
);
const copy = readFileSync(join(process.cwd(), "lib", "i18n", "pos-copy.ts"), "utf8");

const moreSlice = client.slice(client.indexOf("{moreMenuOpen ?"), client.indexOf("{unitDisplayOpen ?"));

check("1. PosWorkspaceModal supports optional onBack without forcing it", () => {
  assert(workspace.includes("onBack?: () => void"), "onBack prop");
  assert(workspace.includes('data-testid="pos-workspace-back"'), "Back button marker");
  assert(workspace.includes("{onBack ? ("), "Back only when provided");
  assert(workspace.includes("ArrowLeft"), "back chevron");
  assert(copy.includes('"ui.back":'), "ui.back i18n");
});

check("2. Escape closes only the topmost workspace modal", () => {
  assert(workspace.includes("workspaceEscapeStack"), "escape stack");
  assert(workspace.includes("stopImmediatePropagation"), "nested Escape isolation");
  assert(workspace.includes('addEventListener("keydown", handleKeyDown, true)'), "capture listener");
});

check("3. More openers keep More mounted (no setMoreMenuOpen(false) on open)", () => {
  assert(!/setRecentSalesOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Recent Sales");
  assert(!/setHeldBillsOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Hold");
  assert(!/setUnitDisplayOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Unit Display");
  assert(!/setCashShiftCountOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Cash Shift Count");
  assert(!/setOwnShiftReportOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Own Shift");
  assert(!/setMemberSearchOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Member Search");
  assert(!/setCashInOutOpen\(true\);\s*setMoreMenuOpen\(false\)/.test(moreSlice), "Cash In/Out");
  assert(!/setReceiptOpen\(true\);\s*[\s\S]{0,80}setMoreMenuOpen\(false\)/.test(moreSlice), "Print path");
  assert(client.includes("function backFromMoreChild"), "Back helper");
  assert(client.includes("function closeMoreChild"), "Close helper");
});

const children: Array<{ name: string; openFlag: string; backNeedle: string; closeNeedle: string }> = [
  {
    name: "Recent Sales",
    openFlag: "recentSalesOpen",
    backNeedle: "onBack={() => backFromMoreChild(() => setRecentSalesOpen(false))}",
    closeNeedle: "onClose={() => closeMoreChild(() => setRecentSalesOpen(false))}",
  },
  {
    name: "Hold Bills / Resume Bills",
    openFlag: "heldBillsOpen",
    backNeedle: 'onBack={() => backFromMoreChild(() => setHeldBillsOpen(false))}',
    closeNeedle: 'onClose={() => closeMoreChild(() => setHeldBillsOpen(false))}',
  },
  {
    name: "Unit Display",
    openFlag: "unitDisplayOpen",
    backNeedle: 'onBack={() => backFromMoreChild(() => setUnitDisplayOpen(false))}',
    closeNeedle: 'onClose={() => closeMoreChild(() => setUnitDisplayOpen(false))}',
  },
  {
    name: "Cash Shift Count",
    openFlag: "cashShiftCountOpen",
    backNeedle: 'onBack={() => backFromMoreChild(() => setCashShiftCountOpen(false))}',
    closeNeedle: 'onClose={() => closeMoreChild(() => setCashShiftCountOpen(false))}',
  },
  {
    name: "Own Shift Report",
    openFlag: "ownShiftReportOpen",
    backNeedle: "onBack={() => backFromMoreChild(() => setOwnShiftReportOpen(false))}",
    closeNeedle: "onClose={() => closeMoreChild(() => setOwnShiftReportOpen(false))}",
  },
  {
    name: "Member Search",
    openFlag: "memberSearchOpen",
    backNeedle: 'onBack={() => backFromMoreChild(() => setMemberSearchOpen(false))}',
    closeNeedle: 'onClose={() => closeMoreChild(() => setMemberSearchOpen(false))}',
  },
  {
    name: "Refund / Void (Return / Exchange / Void)",
    openFlag: "returnExchangeOpen",
    backNeedle: "onBack={() => backFromMoreChild(() => setReturnExchangeOpen(false))}",
    closeNeedle: "onClose={() => closeMoreChild(() => setReturnExchangeOpen(false))}",
  },
  {
    name: "Cash In / Cash Out",
    openFlag: "cashInOutOpen",
    backNeedle: "onBack={() => backFromMoreChild(() => setCashInOutOpen(false))}",
    closeNeedle: "closeMoreChild(() => setCashInOutOpen(false))",
  },
  {
    name: "Print / Reprint Receipt",
    openFlag: "receiptOpen",
    backNeedle: "moreMenuOpen && !recentSalesOpen ? () => backFromMoreChild",
    closeNeedle: "if (!recentSalesOpen) setMoreMenuOpen(false)",
  },
];

for (const child of children) {
  check(`4. ${child.name}: Back → More + X → POS wiring`, () => {
    assert(client.includes(child.openFlag), `${child.openFlag} state`);
    assert(client.includes(child.backNeedle), `${child.name} Back`);
    assert(client.includes(child.closeNeedle), `${child.name} Close`);
  });
}

check("5. Child components forward optional onBack", () => {
  assert(ownShift.includes("onBack?: () => void") && ownShift.includes("onBack={onBack}"), "Own Shift Report");
  assert(cashInOut.includes("onBack?: () => void") && cashInOut.includes("onBack={onBack}"), "Cash In/Out");
  assert(returnExchange.includes("onBack?: () => void") && returnExchange.includes("onBack={onBack}"), "Return/Exchange/Void");
  assert(client.includes("onBack?: () => void") && client.includes("onBack={onBack}"), "Recent Sales / ReceiptPreview");
});

check("6. Unrelated workspaces do not gain forced Back", () => {
  assert(!saleOptions.includes("onBack="), "Sale Options stays without Back");
  const favoritesSlice = client.slice(client.indexOf("{favoritesOpen ?"), client.indexOf("{heldBillsOpen ?"));
  assert(!favoritesSlice.includes("onBack="), "Favorites stays without Back");
});

check("7. Navigation helpers are navigation-only (no cart/payment/cash mutations)", () => {
  const helpers = client.slice(
    client.indexOf("function backFromMoreChild"),
    client.indexOf("function refundSale"),
  );
  assert(!helpers.includes("setCartItems"), "no cart mutate");
  assert(!helpers.includes("setPaymentMode"), "no payment mutate");
  assert(!helpers.includes("setSelectedCustomer"), "no member mutate");
  assert(!helpers.includes("submitCashMovement"), "no cash movement");
  assert(helpers.includes("setMoreMenuOpen(true)"), "Back restores More");
  assert(helpers.includes("setMoreMenuOpen(false)"), "X clears More");
});

check("8. Repeated More child hops leave a single More + one child pattern", () => {
  assert(client.includes("function backFromMoreChild(closeChild: () => void)"), "shared Back");
  assert(client.includes("function closeMoreChild(closeChild: () => void)"), "shared Close");
  const openReturn = client.slice(
    client.indexOf("function openReturnExchange"),
    client.indexOf("function backFromMoreChild"),
  );
  assert(!openReturn.includes("setMoreMenuOpen"), "Return/Void open path does not force-close More");
});

console.log("");
console.log("NOTE: Browser overlay stacking / touch targets require Owner Interaction QA.");
const failed = results.filter((entry) => entry.status === "FAIL");
console.log(`More navigation checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
