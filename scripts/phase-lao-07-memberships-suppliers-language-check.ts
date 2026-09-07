import fs from "node:fs";
import path from "node:path";

import {
  MEMBERSHIPS_COPY,
  localizeMembershipError,
  membershipStatusLabel,
  membershipsCopyHasNoReplacementChars,
  membershipsCopyKeyParity,
} from "../lib/i18n/memberships-copy";
import {
  SUPPLIERS_COPY,
  localizeSupplierError,
  paymentTermLabel,
  supplierStatusLabel,
  supplierTagLabel,
  suppliersCopyHasNoReplacementChars,
  suppliersCopyKeyParity,
} from "../lib/i18n/suppliers-copy";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

const membershipCopy = read("lib/i18n/memberships-copy.ts");
const supplierCopy = read("lib/i18n/suppliers-copy.ts");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");
const membershipPage = read("app/(dashboard)/membership-levels/page.tsx");
const membershipLoading = read("app/(dashboard)/membership-levels/loading.tsx");
const membershipActions = read("features/membership-levels/actions.ts");
const membershipRepo = read("features/membership-levels/prisma-repository.ts");
const supplierList = read("features/suppliers/components/suppliers-list-client.tsx");
const supplierForm = read("features/suppliers/components/supplier-form.tsx");
const supplierDetail = read("features/suppliers/components/supplier-detail-client.tsx");
const supplierPage = read("app/(dashboard)/suppliers/page.tsx");
const supplierNewPage = read("app/(dashboard)/suppliers/new/page.tsx");
const supplierIdPage = read("app/(dashboard)/suppliers/[id]/page.tsx");
const supplierLoading = read("app/(dashboard)/suppliers/loading.tsx");
const supplierActions = read("features/suppliers/actions.ts");
const supplierRepo = read("features/suppliers/prisma-repository.ts");
const shell = read("components/layout/dashboard-shell.tsx");
const purchasingPage = read("app/(dashboard)/purchasing/page.tsx");
const purchasingSuppliersPage = read("app/(dashboard)/purchasing/suppliers/page.tsx");
const purchasingClient = read("features/purchasing/components/purchasing-page-client.tsx");
const purchasingSuppliersClient = read("features/purchasing/components/suppliers-page-client.tsx");
const promotionsPage = read("app/(dashboard)/promotions/page.tsx");
const reportsPage = read("app/(dashboard)/reports/page.tsx");
const settingsPage = read("app/(dashboard)/settings/page.tsx");
const customerDisplay = read("features/pos/components/customer-display-client.tsx");

const men = MEMBERSHIPS_COPY.en;
const mlo = MEMBERSHIPS_COPY.lo;
const sen = SUPPLIERS_COPY.en;
const slo = SUPPLIERS_COPY.lo;
const laoMembership = String.fromCharCode(0x0eaa, 0x0eb0, 0x0ea1, 0x0eb2, 0x0e8a, 0x0eb4, 0x0e81);
const laoSuppliers = String.fromCharCode(0x0e9c, 0x0eb9, 0x0ec9, 0x0eaa, 0x0eb0, 0x0edc, 0x0ead, 0x0e87);

check(
  "1. Memberships Lao copy coverage",
  membershipCopy.includes("export const MEMBERSHIPS_COPY") &&
    Boolean(men.membership && mlo.membership) &&
    Boolean(men.subtitle && mlo.subtitle) &&
    Boolean(men.createLevel && mlo.createLevel) &&
    Boolean(men.editLevel && mlo.editLevel) &&
    Boolean(men.levelName && mlo.levelName) &&
    Boolean(men.active && mlo.active) &&
    Boolean(men.inactive && mlo.inactive) &&
    Boolean(men.searchLevels && mlo.searchLevels) &&
    Boolean(men.noLevelsFound && mlo.noLevelsFound) &&
    Boolean(men.loadingMemberships && mlo.loadingMemberships) &&
    membershipClient.includes('from "@/lib/i18n/memberships-copy"') &&
    membershipLoading.includes("copy.loadingMemberships"),
);

check(
  "2. Suppliers Lao copy coverage",
  supplierCopy.includes("export const SUPPLIERS_COPY") &&
    Boolean(sen.suppliers && slo.suppliers) &&
    Boolean(sen.createSupplier && slo.createSupplier) &&
    Boolean(sen.editSupplier && slo.editSupplier) &&
    Boolean(sen.supplierCode && slo.supplierCode) &&
    Boolean(sen.outstandingBalance && slo.outstandingBalance) &&
    Boolean(sen.searchSuppliers && slo.searchSuppliers) &&
    Boolean(sen.noSuppliersMatch && slo.noSuppliersMatch) &&
    supplierList.includes('from "@/lib/i18n/suppliers-copy"') &&
    supplierForm.includes('from "@/lib/i18n/suppliers-copy"') &&
    supplierDetail.includes('from "@/lib/i18n/suppliers-copy"') &&
    supplierLoading.includes("copy.loadingSuppliers"),
);

check("3. EN/LO key parity", membershipsCopyKeyParity() && suppliersCopyKeyParity());
check(
  "3b. No replacement characters",
  membershipsCopyHasNoReplacementChars() && suppliersCopyHasNoReplacementChars(),
);

check(
  "4. No live Thai Memberships path",
  !membershipCopy.includes('"th"') &&
    !membershipCopy.includes("'th'") &&
    !membershipClient.includes('"en" | "th"') &&
    !membershipClient.includes('from "@/lib/i18n/ui"') &&
    !membershipPage.includes('from "@/lib/i18n/ui"') &&
    !Object.values(mlo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "5. No live Thai Suppliers path",
  !supplierCopy.includes('"th"') &&
    !supplierCopy.includes("'th'") &&
    !supplierList.includes('"en" | "th"') &&
    !supplierForm.includes('"en" | "th"') &&
    !supplierDetail.includes('"en" | "th"') &&
    !supplierList.includes('from "@/lib/i18n/ui"') &&
    !supplierForm.includes('from "@/lib/i18n/ui"') &&
    !supplierDetail.includes('from "@/lib/i18n/ui"') &&
    !Object.values(slo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "6. Sidebar Memberships Lao label",
  shell.includes('tMemberships("membership", "en")') &&
    shell.includes('tMemberships("membership", "lo")') &&
    men.membership === "Membership" &&
    mlo.membership === laoMembership,
);

check(
  "7. Sidebar Suppliers Lao label",
  shell.includes('tSuppliers("suppliers", "en")') &&
    shell.includes('tSuppliers("suppliers", "lo")') &&
    sen.suppliers === "Suppliers" &&
    slo.suppliers === laoSuppliers &&
    shell.includes('promotions: "Promotions"') &&
    shell.includes('settings: "Settings"'),
);

check(
  "8. Membership form Lao copy",
  membershipClient.includes('copy("levelName")') &&
    membershipClient.includes('copy("createLevel")') &&
    membershipClient.includes('copy("editLevel")') &&
    membershipClient.includes('copy("saveLevel")') &&
    membershipClient.includes('copy("cancel")') &&
    membershipClient.includes('copy("minimumSpend")') &&
    membershipClient.includes('copy("discountPercent")'),
);

check(
  "9. Membership status/renewal Lao copy",
  membershipStatusLabel(true, "lo") === mlo.active &&
    membershipStatusLabel(false, "en") === "Inactive" &&
    membershipClient.includes('copy("active")') &&
    membershipClient.includes('copy("inactive")') &&
    membershipClient.includes('copy("archive")') &&
    !membershipClient.includes("Renew") &&
    !membershipClient.includes("Extend"),
);

check(
  "10. Supplier form Lao copy",
  supplierForm.includes('t("createSupplier")') &&
    supplierForm.includes('t("supplierCode")') &&
    supplierForm.includes('t("companyName")') &&
    supplierForm.includes('t("contactName")') &&
    supplierForm.includes('t("phone")') &&
    supplierForm.includes('t("save")') &&
    supplierForm.includes('t("paymentTerms")') &&
    paymentTermLabel("Cash", "lo") === slo.termCash &&
    paymentTermLabel("Cash", "en") === "Cash",
);

check(
  "11. Supplier details Lao copy",
  supplierDetail.includes('t("supplierProfile")') &&
    supplierDetail.includes('t("outstandingBalance")') &&
    supplierDetail.includes('t("editSupplier")') &&
    supplierDetail.includes('t("createPurchaseOrder")') &&
    supplierList.includes('t("supplierDetailSummary")') &&
    supplierStatusLabel("active", "lo") === slo.statusActive,
);

check(
  "12. Validation/error Lao copy",
  localizeMembershipError("name is required.", "lo") === mlo.nameRequired &&
    localizeMembershipError("Permission denied.", "lo") === mlo.permissionDenied &&
    localizeSupplierError("companyName is required.", "lo") === slo.nameRequired &&
    localizeSupplierError("Permission denied.", "en") === "Permission denied." &&
    membershipClient.includes("localizeMembershipError") &&
    supplierForm.includes("localizeSupplierError") &&
    supplierDetail.includes("localizeSupplierError"),
);

check(
  "13. User-entered names remain untouched",
  membershipClient.includes("level.name") &&
    !membershipClient.includes("t(level.name") &&
    supplierList.includes("supplier.companyName") &&
    supplierDetail.includes("supplier.companyName") &&
    supplierForm.includes('name="companyName"') &&
    supplierForm.includes("`Supplier rating: ${rating}`") &&
    supplierForm.includes('"Delivery reliability: UI placeholder"') &&
    supplierTagLabel("Custom Shop Vendor", "lo") === "Custom Shop Vendor",
);

check(
  "14. Purchasing integration unchanged",
  supplierList.includes('href={`/purchasing/new?supplierId=${supplier.id}`}') &&
    supplierDetail.includes("`/purchasing/new?supplierId=${supplier.id}`") &&
    !supplierPage.includes("purchasing-copy") &&
    !supplierList.includes("purchasing-copy") &&
    !supplierForm.includes("purchasing-copy") &&
    !supplierDetail.includes("purchasing-copy") &&
    purchasingPage.includes("PurchasingPageClient") &&
    purchasingSuppliersPage.includes("SuppliersPageClient") &&
    purchasingClient.includes("purchasing-copy") &&
    purchasingSuppliersClient.includes("purchasing-copy") &&
    !purchasingClient.includes("suppliers-copy") &&
    !purchasingSuppliersClient.includes("suppliers-copy") &&
    !purchasingClient.includes("memberships-copy"),
);

check(
  "15. Business logic unchanged",
  membershipActions.includes("export async function createMembershipLevelAction") &&
    membershipActions.includes("export async function updateMembershipLevelAction") &&
    membershipRepo.includes("export async function createPrismaMembershipLevel") &&
    supplierActions.includes("export async function createSupplierAction") &&
    supplierActions.includes("export async function updateSupplierAction") &&
    supplierRepo.includes("createPrismaSupplier") &&
    !promotionsPage.includes("memberships-copy") &&
    !promotionsPage.includes("suppliers-copy") &&
    !reportsPage.includes("memberships-copy") &&
    !reportsPage.includes("suppliers-copy") &&
    !settingsPage.includes("memberships-copy") &&
    !settingsPage.includes("suppliers-copy") &&
    !customerDisplay.includes("memberships-copy") &&
    !customerDisplay.includes("suppliers-copy"),
);

check(
  "Pages pass locale",
  membershipPage.includes("locale={locale}") &&
    supplierPage.includes("locale={locale}") &&
    supplierNewPage.includes("locale={locale}") &&
    supplierIdPage.includes("locale={locale}"),
);

console.log("\nphase-lao-07-memberships-suppliers-language-check: PASS");
process.exit(0);
