/**
 * Phase 2 staff account management. Static + pure. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertStaffAccessFlags, CANONICAL_ASSIGNABLE_ROLES, isAssignableStaffRole, NEW_STAFF_DEFAULTS, validateStaffAccountInput } from "../features/access-control/staff-account";
import { staffStatusForDisplay, staffStatusForStorage } from "../lib/auth/account-access";
import { settingsCopyKeyParity, tSettings } from "../lib/i18n/settings-copy";

const root = process.cwd();
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const staffUi = read("features/settings/components/staff-control-section.tsx");
const repo = read("features/access-control/prisma-repository.ts");
const actions = read("features/access-control/actions.ts");

check("1. owner role is not assignable", !isAssignableStaffRole({ name: "Owner", templateKey: "owner" }));
check("2. manager role is assignable", isAssignableStaffRole({ name: "Manager", templateKey: "manager" }));
check("3. Lao name is preserved", validateStaffAccountInput({ fullName: "  ສົມສະຫວັນ  ", username: "som" }).fullName === "ສົມສະຫວັນ");
check("4. blank username is rejected", (() => { try { validateStaffAccountInput({ fullName: "A", username: "   " }); return false; } catch { return true; } })());
check("5. spaced username is rejected", (() => { try { validateStaffAccountInput({ fullName: "A", username: "a b" }); return false; } catch (error) { return error instanceof Error && error.message.includes("spaces"); } })());
check("6. short password is rejected", (() => { try { validateStaffAccountInput({ fullName: "A", password: "short", passwordRequired: true, username: "a" }); return false; } catch { return true; } })());
check("7. optional edit password can be empty", validateStaffAccountInput({ fullName: "A", password: "  ", username: "a" }).password === undefined);
check("8. display status is disabled", staffStatusForDisplay("disabled") === "disabled" && staffStatusForStorage("inactive") === "disabled");
check("9. deactivate and reactivate keep history rows", repo.includes('action: "deactivate"') && repo.includes('action: "reactivate"') && repo.includes('status: "disabled"') && !repo.includes("tx.user.delete") && !repo.includes("tx.companyUser.delete"));
check("10. password is hashed and omitted from the audit payload", repo.includes("hash(password, 12)") && repo.includes("passwordReset:") && !repo.includes("newData: { ...input"));
check("11. update does not rewrite requirePasswordChange", !repo.slice(repo.indexOf("if (input.id)"), repo.indexOf("const user = await tx.user.create")).includes("requirePasswordChange"));
check("12. branch is scoped to the company", repo.includes("companyId: tenant.companyId, id: branchId"));
check("13. self role and owner assignment stay blocked", repo.includes("change your own role") && repo.includes("isProtectedOwnerRole(role)") && repo.includes("membership.isOwner"));
check("14. staff UI has no PIN field and no hard delete", !staffUi.toLowerCase().includes("pin") && !staffUi.includes("deleteStaff"));
check("15. staff UI uses disabled and reactivate", staffUi.includes('value="disabled"') && staffUi.includes("reactivateStaffMemberAction") && !staffUi.includes('value="inactive"'));
check("16. owner row stays protected in the list", staffUi.includes('member.isOwner') && staffUi.includes('tSettings("protected"'));
check("17. both-access warning is present", staffUi.includes("bothAccessOffWarning"));
check("18. effective access summary is present", staffUi.includes('tSettings("effectiveAccess"'));
check("19. reactivate action uses staff deactivate permission", actions.includes("reactivateStaffMemberAction") && actions.includes('staffTenant("staff.delete")'));
check("20. EN and LO staff copy match", settingsCopyKeyParity() && tSettings("posAccessHelp", "en").includes("POS") && tSettings("posAccessHelp", "lo") !== tSettings("posAccessHelp", "en") && tSettings("disabled", "lo") !== "Disabled");
check("21. false access flags are valid", (() => { try { assertStaffAccessFlags({ allowBackOfficeAccess: false, allowPosAccess: false }); return true; } catch { return false; } })());
check("22. missing access flags are rejected", (() => { try { assertStaffAccessFlags({ allowBackOfficeAccess: undefined, allowPosAccess: false }); return false; } catch { return true; } })());
check("23. new staff defaults are cashier-safe", NEW_STAFF_DEFAULTS.allowPosAccess === true && NEW_STAFF_DEFAULTS.allowBackOfficeAccess === false && NEW_STAFF_DEFAULTS.status === "active");
check("24. canonical roles exclude owner", CANONICAL_ASSIGNABLE_ROLES.every((role) => role.templateKey !== "manager" || role.name === "Manager") && !CANONICAL_ASSIGNABLE_ROLES.some((role) => role.name === "Owner" || role.templateKey === "cashier" && role.label !== "Staff/Cashier") && CANONICAL_ASSIGNABLE_ROLES.some((role) => role.templateKey === "cashier") && CANONICAL_ASSIGNABLE_ROLES.some((role) => role.templateKey === "manager"));
check("25. staff page ensures assignable roles", repo.includes("ensureAssignableStaffRoles") && repo.includes("assertStaffAccessFlags") && !repo.includes("if (!input.allowPosAccess)") && !repo.includes("if (!allowPosAccess)"));

console.log(`\nStaff account management: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
