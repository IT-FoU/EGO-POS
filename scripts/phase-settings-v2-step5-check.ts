import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readSettingsUi } from "./settings-ui-sources";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const checks: Array<[string, () => void]> = [];
function check(name: string, fn: () => void) {
  checks.push([name, fn]);
}

const staffControl = read("features/settings/components/staff-control-section.tsx");
const rolePanel = read("features/settings/components/role-permissions-panel.tsx");
const roleModel = read("features/access-control/role-permission-v2.ts");
const dayOff = read("features/day-off/components/day-off-settings-panel.tsx");
const ot = read("features/ot/components/ot-settings-panel.tsx");
const picker = read("features/settings/components/employee-picker.tsx");
const form = readSettingsUi();
const loyaltyPanel = read("features/settings/components/loyalty-rules-panel.tsx");
const page = read("app/(dashboard)/settings/[section]/page.tsx");
const copy = read("lib/i18n/settings-copy.ts");
const landing = read("features/settings/components/settings-landing.tsx");
const accessRepo = read("features/access-control/prisma-repository.ts");

check("1. staff list remains company scoped", () => {
  assert(accessRepo.includes("companyId: tenant.companyId"), "staff snapshot not company scoped");
});
check("2. staff create/edit allowed fields present", () => {
  assert(staffControl.includes("fullName") && staffControl.includes("username") && staffControl.includes("roleId") && staffControl.includes("branchId"), "staff fields missing");
});
check("3. deactivate confirmation", () => {
  assert(staffControl.includes("deactivateStaffNamed") && staffControl.includes("confirmDeactivateId"), "deactivate confirm missing");
});
check("4. owner protection", () => {
  assert(staffControl.includes("member.isOwner") && staffControl.includes("isAssignableStaffRole") && rolePanel.includes('templateKey === "Owner"') && accessRepo.includes("isProtectedOwnerRole"), "owner protection missing");
});
check("5. terminal management not exposed", () => {
  assert(!staffControl.includes("TERMINAL_OPTIONS") && !staffControl.includes('tSettings("terminal"'), "terminal still exposed");
  assert(staffControl.includes("assignedTerminal"), "terminal value still preserved for save");
});
check("6. PIN/session timeout absent", () => {
  assert(!staffControl.toLowerCase().includes("session timeout") && !staffControl.includes("PIN"), "pin/timeout unexpectedly present");
});
check("7. roles load", () => {
  assert(staffControl.includes("RolePermissionsPanel") && rolePanel.includes("moduleAccess"), "role cards missing");
});
check("8. Owner protected in role detail", () => {
  assert(rolePanel.includes('templateKey === "Owner"') && rolePanel.includes("roleFullAccess") && !rolePanel.includes("min-w-[820px]"), "owner role lock missing");
});
check("9. Manager/Cashier/Custom editable path", () => {
  assert(rolePanel.includes("saveRolePermissionsAction") && rolePanel.includes("resetToDefault"), "role save path missing");
});
check("10. role values load", () => {
  assert(rolePanel.includes("permissionKeysByRole") && accessRepo.includes("permissionKeysByRole"), "role key load missing");
});
check("11. save role permissions", () => {
  assert(rolePanel.includes("saveRolePermissionsAction"), "save permissions action missing");
});
check("12. permission confirmation", () => {
  assert(rolePanel.includes("savePermissionsConfirmTitle") && rolePanel.includes("confirmSave"), "permission confirm missing");
});
check("13. no permission-engine rewrite", () => {
  assert(roleModel.includes("matrixToPermissionKeys") && !roleModel.includes("STORE_PERMISSION_MATRIX") && !staffControl.includes("rewritePermissionEngine"), "unexpected permission rewrite");
});
check("14. no self-escalation UI for Owner role assign", () => {
  assert(staffControl.includes("isAssignableStaffRole"), "owner assignable unexpectedly");
});
check("15. approval rules load", () => {
  assert(staffControl.includes("approvalRules") && staffControl.includes("APPROVAL_RULE_LABELS"), "approval rules missing");
});
check("16. approval enabled toggle", () => {
  assert(staffControl.includes("isEnabled"), "enabled toggle missing");
});
check("17. approver role", () => {
  assert(staffControl.includes("approverRole") && staffControl.includes("managerApproval"), "approver role missing");
});
check("18. threshold validation fields", () => {
  assert(staffControl.includes("thresholdPercent") && staffControl.includes("thresholdLak"), "thresholds missing");
});
check("19. percent display", () => {
  assert(staffControl.includes('tSettings("thresholdPercent"'), "percent label missing");
});
check("20. LAK display", () => {
  assert(staffControl.includes('tSettings("thresholdLak"'), "LAK label missing");
});
check("21. approval confirmation", () => {
  assert(staffControl.includes("saveApprovalConfirmTitle") && staffControl.includes("confirmApprovalRule"), "approval confirm missing");
});
check("22. existing enforcement actions remain", () => {
  assert(staffControl.includes("saveApprovalRuleAction"), "approval save action missing");
});
check("23. day off no raw user-id field", () => {
  assert(!dayOff.includes("Employee user id") && !dayOff.includes('placeholder="Employee'), "raw user id still present");
});
check("24. day off employee picker company scoped", () => {
  assert(dayOff.includes("EmployeePicker") && page.includes('section === "day-off"'), "day off picker wiring missing");
});
check("25. company default option", () => {
  assert(picker.includes("allowCompanyDefault") && picker.includes("companyDefault"), "company default missing");
});
check("26. weekly day off save", () => {
  assert(dayOff.includes("upsert_weekly"), "weekly save missing");
});
check("27. quota save", () => {
  assert(dayOff.includes("upsert_quota_policy"), "quota save missing");
});
check("28. special grant", () => {
  assert(dayOff.includes("grant_special"), "special grant missing");
});
check("29. attendance integration untouched", () => {
  assert(read("features/day-off/prisma-repository.ts").includes("assertNoWeeklyConflict"), "attendance integration missing");
});
check("30. day off EN keys", () => {
  assert(copy.includes('"dayOffSettingsTitle": "Day Off"'), "day off EN missing");
});
check("31. day off LO keys", () => {
  assert(copy.includes('"dayOffSettingsTitle": "ວັນພັກ"'), "day off LO missing");
});
check("32. day off validation", () => {
  assert(
    dayOff.includes("employeeActionsDisabled") &&
      dayOff.includes("disabled={employeeActionsDisabled}") &&
      dayOff.includes("if (!userId) return") &&
      dayOff.includes("companyDefaultEmployeeOnly") &&
      dayOff.includes("specialDateRequired"),
    "day off validation missing",
  );
});
check("33. day off empty state", () => {
  assert(dayOff.includes("noEmployeesFound"), "day off empty state missing");
});
check("34. day off error state", () => {
  assert(dayOff.includes("dayOffSaveFailed") && dayOff.includes('tone: "error"'), "day off error missing");
});
check("35. ot no raw user-id field", () => {
  assert(!ot.includes("Employee user id") && ot.includes("EmployeePicker"), "ot raw id still present");
});
check("36. ot employee picker company scoped", () => {
  assert(ot.includes("EmployeePicker") && page.includes('section === "ot"'), "ot picker wiring missing");
});
check("37. weekday windows load/save", () => {
  assert(ot.includes("upsert_policy") && ot.includes("weekday"), "ot weekday save missing");
});
check("38. attendance-minute path preserved", () => {
  assert(read("features/ot/ot-math.ts").includes("startMinute") && read("features/ot/prisma-repository.ts").includes("upsert"), "ot minute path missing");
});
check("39. ot EN keys", () => {
  assert(copy.includes('"otSettingsTitle": "OT"') && copy.includes('"otStartTime": "Start time"'), "ot EN missing");
});
check("40. ot LO keys", () => {
  assert(copy.includes('"otStartTime": "ເລີ່ມເວລາ"'), "ot LO missing");
});
check("41. ot validation", () => {
  assert(ot.includes("otTimeOrderInvalid"), "ot validation missing");
});
check("42. ot empty/error state", () => {
  assert(ot.includes("noEmployeesFound") && ot.includes("otSaveFailed"), "ot empty/error missing");
});
check("43. no payroll fields", () => {
  assert(!ot.toLowerCase().includes("pay rate") && ot.includes("otNoPayrollHelp"), "payroll fields unexpected");
});
check("44. no rate/multiplier fields", () => {
  assert(!ot.toLowerCase().includes("multiplier"), "multiplier fields unexpected");
});
check("45. loyalty enabled load/save", () => {
  assert(form.includes("loyaltyEnabled") && form.includes('section === "loyalty"'), "loyalty save missing");
});
check("46. spend-per-point", () => {
  assert(loyaltyPanel.includes("spendLakPerPoint") && loyaltyPanel.includes("spendRuleHelp") && !form.includes("loyaltySpendPerPointLak"), "spend per point must stay inside Earning Rules");
  assert(read("features/settings/prisma-repository.ts").includes("loyaltySpendPerPointLak"), "legacy spend column still persisted");
});
check("47. point value", () => {
  assert(form.includes("loyaltyPointValueLak"), "point value missing");
});
check("48. min redeem", () => {
  assert(form.includes("loyaltyMinRedeemPoints"), "min redeem missing");
});
check("49. loyalty confirmation", () => {
  assert(form.includes("loyaltyChange") && form.includes("loyaltyChangeConfirmTitle"), "loyalty confirm missing");
});
check("50. POS earn regression untouched", () => {
  assert(read("features/settings/prisma-repository.ts").includes("loyaltySpendPerPointLak"), "loyalty persistence missing");
});
check("51. POS redeem regression untouched", () => {
  assert(read("features/settings/prisma-repository.ts").includes("loyaltyPointValueLak"), "redeem persistence missing");
});
check("52. historical ledger untouched", () => {
  assert(!form.includes("rewriteLoyaltyLedger") && !form.includes("deleteLoyalty"), "ledger rewrite unexpected");
});
check("53. Membership remains separate", () => {
  assert(landing.includes("membership") && !landing.includes('href: "/settings/membership"'), "membership incorrectly inside settings");
});
check("54. Step 3 routes unchanged", () => {
  assert(page.includes('"day-off"') && page.includes('"loyalty"') && page.includes('"roles"'), "routes missing");
});
check("55. Staff split unchanged", () => {
  assert(landing.includes("/settings/staff") && landing.includes("/settings/roles") && landing.includes("/settings/approval-rules"), "staff split missing");
});
check("56. Loyalty under Customers only", () => {
  assert(landing.includes('href: "/settings/loyalty"') && landing.includes('data-settings-category="customers"') || landing.includes("Customers"), "loyalty placement missing");
});
check("57. no global Save", () => {
  assert(landing.includes("data-settings-landing") && !landing.includes("Save settings"), "global save regression");
});
check("58. landing summaries real", () => {
  assert(landing.includes("activeStaff") && landing.includes("loyaltyEnabled"), "landing summaries missing");
});
check("staff snapshot for day-off/ot", () => {
  assert(page.includes('section === "day-off"') && page.includes('section === "ot"') && page.includes("getSettingsSectionStaffSnapshot"), "picker data load missing");
});
check("no new migration", () => {
  const dirs = readdirSync(join(root, "prisma/migrations"));
  assert(!dirs.some((name) => /settings_v2_step5|20261002[1-9]|20261003|20261004/.test(name) && !name.includes("loyalty_earning_rules") && !name.includes("loyalty_point_policy") && !name.includes("support_tickets") && !name.includes("pos_terminals")), "unexpected post-step2 settings migration");
});
check("EN/LO copy parity keys present", () => {
  assert(copy.includes("deactivateStaffConfirm") && copy.includes("employeePickerHelp"), "step5 copy incomplete");
});

let failed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL: ${name} — ${(error as Error).message}`);
  }
}

console.log(`\nSettings V2 step 5: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
