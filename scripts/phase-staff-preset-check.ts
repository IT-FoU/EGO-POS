/**
 * Phase 5.1 staff preset completion. Pure checks. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FINE } from "../features/access-control/fine-permissions";
import {
  parseStaffCreateDefaults,
  previewStaffAccess,
  recommendedStaffSetup,
  STAFF_CREATE_DEFAULTS_KEY,
  withStaffCreateDefaults,
} from "../features/access-control/staff-create-defaults";
import { sanitizeLastUsed } from "../features/access-control/staff-presets";
import { mergeUnitPricingDefaultsFromUnits } from "../features/products/unit-pricing-defaults";
import { settingsCopyKeyParity, tSettings } from "../lib/i18n/settings-copy";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL ${name}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const branches = [{ id: "main" }, { id: "other" }];
const recommendedCashier = recommendedStaffSetup("cashier", branches);
const recommendedManager = recommendedStaffSetup("manager", branches);
check("cashier recommended setup is POS on and Back Office off", recommendedCashier.allowPosAccess === true && recommendedCashier.allowBackOfficeAccess === false && recommendedCashier.branchId === "main");
check("manager recommended setup is POS on and Back Office on", recommendedManager.allowPosAccess === true && recommendedManager.allowBackOfficeAccess === true);

const missing = parseStaffCreateDefaults({ __receiptLayout: { showQr: true } }, branches);
check("missing defaults use the recommended setup", missing.cashier.allowBackOfficeAccess === false && missing.manager.allowBackOfficeAccess === true);

const stale = parseStaffCreateDefaults({
  [STAFF_CREATE_DEFAULTS_KEY]: {
    cashier: { allowBackOfficeAccess: true, allowPosAccess: false, branchId: "gone", password: "secret" },
    manager: { allowBackOfficeAccess: false, allowPosAccess: true, branchId: "other" },
  },
}, branches);
check("a preset that contains a password is ignored", stale.cashier.allowPosAccess === true && stale.cashier.allowBackOfficeAccess === false && stale.cashier.branchId === "main");
check("a valid stored branch is kept and a missing branch falls back", stale.manager.branchId === "other" && stale.manager.allowPosAccess === true && stale.manager.allowBackOfficeAccess === false);

const packed = withStaffCreateDefaults({ __receiptLayout: { showQr: true }, units: {}, version: 1 }, {
  cashier: { allowBackOfficeAccess: true, allowPosAccess: false, branchId: "main" },
  manager: recommendedManager,
});
const saved = packed[STAFF_CREATE_DEFAULTS_KEY] as { cashier: Record<string, unknown>; manager: Record<string, unknown> };
check("company defaults keep the receipt layout and omit personal fields", packed.__receiptLayout !== undefined && !("password" in saved.cashier) && !("username" in saved.cashier) && !("rolePermissions" in saved.cashier));
check("saved cashier flags are only the setup template", saved.cashier.allowPosAccess === false && saved.cashier.allowBackOfficeAccess === true && saved.cashier.branchId === "main");

const merged = mergeUnitPricingDefaultsFromUnits(packed, []);
check("unit pricing save keeps staff defaults", Boolean((merged as Record<string, unknown>)[STAFF_CREATE_DEFAULTS_KEY]));

const companyA = sanitizeLastUsed({
  allowBackOfficeAccess: false,
  allowPosAccess: true,
  branchId: "main",
  companyId: "company-a",
  roleId: "cashier-role",
}, "company-a");
const leaked = sanitizeLastUsed(companyA, "company-b");
const withPassword = sanitizeLastUsed({ ...companyA, password: "secret" }, "company-a");
check("last used stays on this device for one company", companyA?.roleId === "cashier-role" && companyA.branchId === "main" && leaked === null);
check("last used rejects a password", withPassword === null);

const cashierPreview = previewStaffAccess({
  allowBackOfficeAccess: false,
  allowPosAccess: true,
  permissionKeys: ["pos.view", "pos.create", "pos.access", "reports.access", FINE.reportsToday],
});
check("cashier preview uses the saved role and the form gates", cashierPreview.pos === "allowed" && cashierPreview.backOffice === "blocked" && cashierPreview.reports === "today" && cashierPreview.profit === "hidden" && cashierPreview.cost === "hidden" && cashierPreview.refund === "denied");

const managerPreview = previewStaffAccess({
  allowBackOfficeAccess: true,
  allowPosAccess: true,
  permissionKeys: ["reports.access", FINE.reportsToday, FINE.reportsHistorical, FINE.reportsProfit, FINE.posRefund, "pos.access"],
});
check("manager preview follows saved report and refund keys", managerPreview.backOffice === "allowed" && managerPreview.reports === "historical" && managerPreview.profit === "visible" && managerPreview.refund === "allowed");

const changedRole = previewStaffAccess({
  allowBackOfficeAccess: false,
  allowPosAccess: true,
  permissionKeys: ["reports.access", FINE.reportsHistorical, FINE.posRefund],
});
check("changing role updates the preview without changing the access flags", changedRole.pos === "allowed" && changedRole.backOffice === "blocked" && changedRole.reports === "historical" && changedRole.refund === "allowed");
const posOff = previewStaffAccess({
  allowBackOfficeAccess: true,
  allowPosAccess: false,
  permissionKeys: [FINE.posRefund, "reports.access", FINE.reportsToday],
});
check("turning POS off denies refund without rewriting the role", posOff.pos === "blocked" && posOff.refund === "denied" && posOff.reports === "today");

const staff = read("features/settings/components/staff-control-section.tsx");
const repo = read("features/access-control/prisma-repository.ts");
const actions = read("features/access-control/actions.ts");
const defaults = read("features/access-control/staff-create-defaults.ts");
check("create staff does not write role permissions", !staff.includes("saveRolePermissions") && repo.includes("saveCompanyStaffCreateDefault") && !repo.slice(repo.indexOf("export async function saveCompanyStaffCreateDefault")).includes("saveRolePermissions"));
check("defaults action is separate from role permission saves", actions.includes("saveStaffCreateDefaultAction") && actions.includes("saveCompanyStaffCreateDefault"));
check("preset storage has no permission override table", !defaults.includes("user_permission_overrides") && !staff.includes("user_permission_overrides"));
check("owner gate is required to save a staff default", repo.includes("if (!actor.isOwner)") && staff.includes("actorIsOwner"));
check("success text stays in the staff section", staff.includes('role="status"') && staff.includes("staffCreated"));
check("failure keeps the drawer open", staff.includes("setStaffFormError") && !staff.includes("setStaffModalOpen(false);\n    }"));
const labels = ["cashierDefault", "managerDefault", "lastUsedPreset", "customPreset", "saveAsCashierDefault", "saveAsManagerDefault", "resetCashierDefault", "resetManagerDefault", "effectiveAccessPreview", "applyRoleDefault", "staffCreated", "scopeThisDevice", "scopeCompany"];
check("new preset copy exists in English and Lao", settingsCopyKeyParity() && labels.every((key) => tSettings(key, "en") !== tSettings(key, "lo") && !tSettings(key, "lo").includes("\uFFFD")));

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
