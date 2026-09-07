import fs from "node:fs";
import path from "node:path";

import {
  CUSTOMERS_COPY,
  customerStatusLabel,
  customersCopyHasNoReplacementChars,
  customersCopyKeyParity,
  localizedMembershipLabel,
} from "../lib/i18n/customers-copy";

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

const copyFile = read("lib/i18n/customers-copy.ts");
const list = read("features/customers/components/customers-list-client.tsx");
const form = read("features/customers/components/customer-form.tsx");
const detail = read("features/customers/components/customer-detail-client.tsx");
const page = read("app/(dashboard)/customers/page.tsx");
const newPage = read("app/(dashboard)/customers/new/page.tsx");
const idPage = read("app/(dashboard)/customers/[id]/page.tsx");
const loading = read("app/(dashboard)/customers/loading.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const actions = read("features/customers/actions.ts");
const repo = read("features/customers/prisma-repository.ts");
const membershipDisplay = read("features/customers/membership-display.ts");
const promotionsPage = read("app/(dashboard)/promotions/page.tsx");
const reportsCustomers = read("app/(dashboard)/reports/customers/page.tsx");
const settingsPage = read("app/(dashboard)/settings/page.tsx");
const membershipLevels = read("app/(dashboard)/membership-levels/page.tsx");
const customerDisplay = read("features/pos/components/customer-display-client.tsx");

const en = CUSTOMERS_COPY.en;
const lo = CUSTOMERS_COPY.lo;
const laoCustomers = String.fromCharCode(0x0ea5, 0x0eb9, 0x0e81, 0x0e84, 0x0ec9, 0x0eb2);

check(
  "1. Customers/Members Lao copy coverage",
  copyFile.includes("export const CUSTOMERS_COPY") &&
    Boolean(en.customers && lo.customers) &&
    Boolean(en.customersSubtitle && lo.customersSubtitle) &&
    Boolean(en.createCustomer && lo.createCustomer) &&
    Boolean(en.createCustomerTitle && lo.createCustomerTitle) &&
    Boolean(en.editProfile && lo.editProfile) &&
    Boolean(en.customerInformation && lo.customerInformation) &&
    Boolean(en.purchaseHistory && lo.purchaseHistory) &&
    Boolean(en.availablePoints && lo.availablePoints) &&
    Boolean(en.currentPoints && lo.currentPoints) &&
    Boolean(en.memberReference && lo.memberReference) &&
    Boolean(en.membershipQrCard && lo.membershipQrCard) &&
    Boolean(en.membershipBarcode && lo.membershipBarcode) &&
    Boolean(en.phoneRequired && lo.phoneRequired) &&
    Boolean(en.customerSaved && lo.customerSaved) &&
    Boolean(en.noCustomers && lo.noCustomers) &&
    Boolean(en.noCustomersMatch && lo.noCustomersMatch) &&
    Boolean(en.loadingCustomers && lo.loadingCustomers) &&
    list.includes('from "@/lib/i18n/customers-copy"') &&
    form.includes('from "@/lib/i18n/customers-copy"') &&
    detail.includes('from "@/lib/i18n/customers-copy"') &&
    loading.includes('from "@/lib/i18n/customers-copy"'),
);

check("2. EN/LO key parity", customersCopyKeyParity());
check("3. No replacement characters", customersCopyHasNoReplacementChars());

check(
  "3b. No live Thai Customers/Members path",
  !copyFile.includes('"th"') &&
    !copyFile.includes("'th'") &&
    !list.includes('"en" | "th"') &&
    !form.includes('"en" | "th"') &&
    !detail.includes('"en" | "th"') &&
    !list.includes('from "@/lib/i18n/ui"') &&
    !form.includes('from "@/lib/i18n/ui"') &&
    !detail.includes('from "@/lib/i18n/ui"') &&
    !list.includes('t("ui.') &&
    !form.includes('t("ui.') &&
    !detail.includes('t("ui.') &&
    !page.includes('from "@/lib/i18n/ui"') &&
    !newPage.includes('from "@/lib/i18n/ui"') &&
    !idPage.includes('from "@/lib/i18n/ui"'),
);

check(
  "4. No raw missing translation keys",
  !copyFile.includes("MISSING_KEY") &&
    list.includes('t("') &&
    form.includes('t("') &&
    detail.includes('t("'),
);

check(
  "5. Sidebar Customers Lao label",
  shell.includes('tCustomers("customers", "en")') &&
    shell.includes('tCustomers("customers", "lo")') &&
    en.customers === "Customers" &&
    lo.customers === laoCustomers &&
    shell.includes('membership: "Membership"'),
);

check(
  "6. Create/edit form Lao copy",
  form.includes('from "@/lib/i18n/customers-copy"') &&
    form.includes("localizeCustomerError") &&
    form.includes("localizedMembershipLabel") &&
    form.includes('t("fullName")') &&
    form.includes('t("phone")') &&
    form.includes('t("membershipLevel")') &&
    form.includes('t("save")') &&
    form.includes('t("createCustomerTitle")') &&
    !form.includes('from "@/lib/i18n/ui"') &&
    detail.includes('t("editProfile")') &&
    detail.includes('t("saveProfile")'),
);

check(
  "7. Membership states Lao copy",
  Boolean(en.member && lo.member) &&
    Boolean(en.membership && lo.membership) &&
    Boolean(en.levelGold && lo.levelGold) &&
    Boolean(en.levelSilver && lo.levelSilver) &&
    Boolean(en.levelStandard && lo.levelStandard) &&
    Boolean(en.levelPlatinum && lo.levelPlatinum) &&
    Boolean(en.noMembership && lo.noMembership) &&
    localizedMembershipLabel("Gold", "lo") === lo.levelGold &&
    localizedMembershipLabel("Silver", "en") === "Silver" &&
    localizedMembershipLabel("VIP Club", "lo") === "VIP Club",
);

check(
  "8. Points/rewards Lao copy",
  Boolean(en.points && lo.points) &&
    Boolean(en.availablePoints && lo.availablePoints) &&
    Boolean(en.pointsEarned && lo.pointsEarned) &&
    Boolean(en.redeemedPoints && lo.redeemedPoints) &&
    Boolean(en.noPointsHistory && lo.noPointsHistory) &&
    list.includes('t("points")') &&
    detail.includes('t("availablePoints")') &&
    detail.includes('t("noPointsHistory")'),
);

check(
  "9. Validation/error Lao copy",
  Boolean(en.phoneRequired && lo.phoneRequired) &&
    Boolean(en.nameRequired && lo.nameRequired) &&
    Boolean(en.customerSaveFailed && lo.customerSaveFailed) &&
    Boolean(en.customerUpdateFailed && lo.customerUpdateFailed) &&
    Boolean(en.permissionDenied && lo.permissionDenied) &&
    Boolean(en.customerSaved && lo.customerSaved) &&
    Boolean(en.customerUpdated && lo.customerUpdated) &&
    Boolean(en.customerPaymentSaved && lo.customerPaymentSaved) &&
    Boolean(en.customerPaymentFailed && lo.customerPaymentFailed) &&
    form.includes("localizeCustomerError") &&
    detail.includes("localizeCustomerError"),
);

check(
  "10. Customer-entered names remain untouched",
  list.includes("customer.fullName") &&
    detail.includes("customer.fullName") &&
    form.includes('name="fullName"') &&
    !list.includes("t(customer.fullName") &&
    !detail.includes("t(customer.fullName") &&
    localizedMembershipLabel("Custom Shop Club", "lo") === "Custom Shop Club" &&
    localizedMembershipLabel("Custom Shop Club", "en") === "Custom Shop Club",
);

check(
  "11. Existing business logic unchanged",
  list.includes('href="/customers/new"') &&
    list.includes("getCustomerSegment") &&
    detail.includes("updateCustomerAction") &&
    detail.includes("createCustomerPaymentAction") &&
    detail.includes("customer.customerCode") &&
    form.includes("createCustomerAction") &&
    actions.includes("export async function createCustomerAction") &&
    actions.includes("export async function updateCustomerAction") &&
    actions.includes("export async function createCustomerPaymentAction") &&
    repo.includes("export async function createPrismaCustomer") &&
    membershipDisplay.includes("export function membershipDisplayLabel") &&
    !promotionsPage.includes("customers-copy") &&
    !reportsCustomers.includes("customers-copy") &&
    !settingsPage.includes("customers-copy") &&
    !membershipLevels.includes("customers-copy") &&
    !customerDisplay.includes("customers-copy"),
);

check(
  "Status helper",
  customerStatusLabel("active", "lo") === lo.statusActive &&
    customerStatusLabel("active", "en") === "Active",
);

check(
  "Pages pass locale",
  page.includes("locale={locale}") &&
    newPage.includes("locale={locale}") &&
    idPage.includes("locale={locale}"),
);

check("Loading page uses customers copy", loading.includes("copy.loadingCustomers"));

const thaiInLo = Object.values(lo).some((value) => /[\u0E00-\u0E7F]/.test(value));
check("No Thai script in Lao Customers copy", !thaiInLo);

console.log("\nphase-lao-06-customers-language-check: PASS");
process.exit(0);
