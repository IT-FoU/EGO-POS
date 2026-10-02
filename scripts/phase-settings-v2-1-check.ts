/**
 * Settings V2.1 — Staff & Security rename, Branch Information, Help & Support.
 * Static only: no database, network, deployment, or production access.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const check = (label: string, ok: boolean) => {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
};

const landing = read("features/settings/components/settings-landing.tsx");
const detailPage = read("app/(dashboard)/settings/[section]/page.tsx");
const form = read("features/settings/components/settings-form.tsx");
const actions = read("features/settings/actions.ts");
const branchRepo = read("features/settings/branch-information.ts");
const branchPanel = read("features/settings/components/branch-information-panel.tsx");
const helpPanel = read("features/settings/components/help-support-panel.tsx");
const helpTopics = read("features/settings/help-topics.ts");
const settingsCopy = read("lib/i18n/settings-copy.ts");
const schema = read("prisma/schema.prisma");

check("10. EN Staff & Security title", landing.includes('text("Staff & Security"') && settingsCopy.includes('"categoryStaff": "Staff & Security"'));
check("11. LO Staff & Security title", landing.includes("ພະນັກງານ ແລະ ຄວາມປອດໄພ") && settingsCopy.includes('"categoryStaff": "ພະນັກງານ ແລະ ຄວາມປອດໄພ"'));
check("12. existing staff child rows unchanged", ["/settings/staff", "/settings/roles", "/settings/approval-rules", "/settings/day-off", "/settings/ot"].every((href) => landing.includes(`href: "${href}"`)));

check("13. Branch Information landing row", landing.includes('href: "/settings/branch-information"') && landing.includes("Branch Information"));
check("14. Branch scope badge", landing.includes('scope: "branch"') && form.includes("scopeBranch") && settingsCopy.includes('"scopeBranch"'));
check("15. active branch load server-side", detailPage.includes("getActiveBranchInformation") && branchRepo.includes("tenant.branchId") && !branchRepo.includes("input.branchId"));
check("16-18. branch name/phone/address fields", branchPanel.includes("branchName") && branchPanel.includes("branchPhone") && branchPanel.includes("branchAddress"));
check("19. branch validation name required", branchPanel.includes("branchNameRequired") && branchRepo.includes('throw new Error("Branch name is required.")'));
check("20. branch save uses trusted tenant only", actions.includes("updateActiveBranchInformationAction") && !actions.includes("branchId: input") && branchRepo.includes("where: { companyId: tenant.companyId, id: branchId }"));
check("21. settings.manage write gate", actions.includes("WRITE_PERMISSIONS.settingsManage") && actions.includes("updateActiveBranchInformation("));
check("22. no other branch editor / create / delete", !branchPanel.includes("createBranch") && !branchRepo.includes("branch.create") && !branchRepo.includes("branch.delete") && !landing.includes("Branch Management"));

check("23. Help & Support row", landing.includes('id: "help"') && landing.includes('href: "/settings/help"'));
check("24. Help route registered", detailPage.includes('"help"') && form.includes('"help"'));
check("25. static topics render", helpTopics.includes("Getting Started") && helpTopics.includes("Cash Shift") && helpTopics.includes("HELP_TOPICS"));
check("26. EN help content", helpTopics.includes("Getting Started") && helpPanel.includes("helpCenter"));
check("27. LO help content", helpTopics.includes("ເລີ່ມຕົ້ນໃຊ້ງານ") && settingsCopy.includes('"helpAndSupport": "ຊ່ວຍເຫຼືອ ແລະ ສະໜັບສະໜູນ"'));
check("28. local help search", helpPanel.includes("filterHelpTopics") && helpTopics.includes("filterHelpTopics"));
check("29. About values safe", helpPanel.includes("versionUnavailable") && helpPanel.includes("APP_NAME") && !helpPanel.includes("NEXTAUTH") && !helpPanel.includes("password") && !helpPanel.includes("cookie"));
check("30. Copy System Information", helpPanel.includes("copySystemInformation") && helpPanel.includes("buildCopyText"));
check("31. no ticket form", !helpPanel.includes("submitTicket") && !landing.includes("Contact Support") && !landing.includes("Report a Problem") && landing.includes("Support ticket submission is not available yet"));
check("32. no attachment UI", !helpPanel.includes("attachment") && !helpPanel.includes("type=\"file\""));
check("33. deferred support explanation", landing.includes("Support ticket submission is not available yet") && settingsCopy.includes("supportTicketsDeferred"));

check("34. branch search", landing.includes("keywords: \"branch information"));
check("35-37. help/support/about search", landing.includes("keywords: \"help support about version"));
check("38. bug/problem explanation-only", landing.includes("problem bug feedback feature request") && landing.includes("Support ticket submission is not available yet"));

check("39. original categories remain", landing.includes('id: "business"') && landing.includes('id: "pos-payments"') && landing.includes('id: "customers"'));
check("40. no schema migration for v2.1", !existsSync(join(root, "prisma/migrations/20261002140000_settings_v2_1")) && schema.includes("model Branch"));
check("41. no global Save on landing", !landing.includes("saveSettings"));
check("42. Activity Logs still outside Settings", landing.includes('href: "/activity-logs"'));
check("43. Membership remains separate", landing.includes('href: "/membership-levels"'));
check("44. Reorder remains link-out", landing.includes('href: "/reports/inventory/reorder"'));
check("security: never trust client branchId", !branchRepo.includes("input.branchId") && !actions.includes("branchId:") && branchRepo.includes("Never accepts a client-supplied branch id"));
check("copy excludes secrets", !helpPanel.includes("token") && !helpPanel.includes("cookie") && helpPanel.includes('Version: unavailable'));

console.log(`\nSettings V2.1: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
