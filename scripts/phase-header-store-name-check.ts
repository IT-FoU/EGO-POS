import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveActiveCompanyName } from "../lib/auth/active-company-name.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const dashboardShell = readFileSync(join(root, "components/layout/dashboard-shell.tsx"), "utf8");
const settingsAction = readFileSync(join(root, "features/settings/actions.ts"), "utf8");
const settingsForm = readFileSync(join(root, "features/settings/components/settings-form.tsx"), "utf8");
const settingsRepository = readFileSync(join(root, "features/settings/prisma-repository.ts"), "utf8");
const authOptions = readFileSync(join(root, "lib/auth/options.ts"), "utf8");
const sessionRefresh = readFileSync(join(root, "lib/auth/update-active-company-session.ts"), "utf8");
const provisionStore = readFileSync(join(root, "lib/setup-admin/provision-store.ts"), "utf8");

for (const name of ["Thank You Shop", "Lucky Store", "ABC Mini Mart", "Happy Market"]) {
  assert(resolveActiveCompanyName(name) === name, `exact company name is preserved: ${name}`);
}
assert(resolveActiveCompanyName(null) === "Business", "safe fallback is used only when the name is unavailable");
assert(resolveActiveCompanyName("") === "Business", "empty company name uses the safe fallback");

assert(
  dashboardShell.includes("resolveActiveCompanyName(session.user.activeCompanyName)"),
  "header reads the active session company name through the exact-name resolver",
);
assert(!dashboardShell.includes("normalizeStoreName"), "header no longer normalizes business-type suffixes");
assert(dashboardShell.includes('title={storeName}'), "long names retain a title tooltip");
assert(!dashboardShell.includes("GO BOX"), "header has no GO BOX runtime override");
assert(dashboardShell.includes("<PlanStatusControl"), "plan countdown remains an independent header control");

assert(settingsRepository.includes("name: normalized.companyName"), "settings persist Company.name");
assert(
  settingsRepository.includes("id: tenant.companyId") &&
    settingsRepository.includes('members: { some: { status: "active", userId: tenant.userId } }'),
  "settings reads and writes remain tenant-scoped",
);
assert(settingsAction.includes("updateActiveCompanySession"), "settings refresh the authenticated company session");
assert(settingsAction.includes("getCurrentSession"), "settings refresh the current authenticated session");
assert(settingsForm.includes("router.refresh()"), "settings refresh the rendered header after save");
assert(settingsForm.includes("ACTIVE_COMPANY_NAME_CHANGE_EVENT"), "settings publish the saved company name to the header");

assert(authOptions.includes("activeCompanyName: activeCompany.name"), "login session uses the active Company.name");
assert(sessionRefresh.includes("getMembershipSessionFields(userId, companyId)"), "session refresh resolves the selected tenant");
assert(
  sessionRefresh.includes("activeCompanyName: sessionFields.activeCompanyName") &&
    sessionRefresh.includes("activeCompanyName: updatedCompanyName"),
  "session refresh carries the current Company.name",
);
assert(provisionStore.includes("name: storeName"), "new businesses persist the submitted store name");

console.log("PASS: header store name source, exact rendering, rename refresh, and tenant scope");
