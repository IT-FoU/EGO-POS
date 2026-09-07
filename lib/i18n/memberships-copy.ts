import { normalizeLocale } from "@/lib/i18n/locale";

const en = {
  action: "Action",
  active: "Active",
  activeLevels: "Active levels",
  all: "All",
  approvalRequired: "Approval required.",
  archive: "Archive",
  archiveConfirm: "Deactivate this membership level?",
  archiveFailed: "Membership level archive failed.",
  archived: "Membership level archived.",
  backToMembership: "Back to Membership",
  cancel: "Cancel",
  clearFilters: "Clear filters",
  close: "Close",
  createLevel: "Create level",
  created: "Membership level created.",
  customers: "Customers",
  customersInLevels: "Customers in levels",
  delete: "Delete",
  deleteConfirm: "Delete this membership level? Referenced levels will be archived instead.",
  deleteFailed: "Membership level delete failed.",
  deletedOrArchived: "Membership level deleted or safely archived.",
  discountPercent: "Discount percent",
  discountRange: "Discount percent must be between 0 and 100.",
  edit: "Edit",
  editLevel: "Edit level",
  failedToLoad: "Failed to load memberships.",
  filters: "Filters",
  futureRulesNote: "Fixed discounts, rounding, duration, welcome points, point expiry, exclusions, and inline loyalty settings are future phases and are not saved from this page.",
  highestDiscount: "Highest discount",
  inactive: "Inactive",
  inactiveLevels: "Inactive levels",
  levelInformation: "Level information",
  levelName: "Level name",
  loadingMemberships: "Loading memberships...",
  loyaltyNote: "Loyalty point rules are managed in Store Settings. This page edits membership levels only.",
  membership: "Membership",
  membershipLevels: "Membership levels",
  membershipRules: "Membership rules",
  membershipRulesNote: "Phase 1 supports percent discount and spend threshold only.",
  minSpendNegative: "Minimum spend cannot be negative.",
  minimumSpend: "Minimum spend",
  nameRequired: "Membership level name is required.",
  noLevelsFound: "No membership levels found.",
  openActions: "Open actions for {name}",
  permissionDenied: "Permission denied.",
  posDiscountNote: "POS currently uses the active customer membership percent discount only. Advanced membership rules are intentionally hidden until backend support exists.",
  promotions: "Promotions",
  retry: "Retry",
  saveFailed: "Membership level save failed.",
  saveLevel: "Save level",
  saving: "Saving",
  searchLevels: "Search levels",
  status: "Status",
  subtitle: "Manage membership levels using the fields that are saved and used by POS today: level name, spend threshold, percent discount, and active status.",
  updated: "Membership level updated.",
  view: "View",
};

const lo = {
  action: "ຄຳສັ່ງ",
  active: "ໃຊ້ງານ",
  activeLevels: "ລະດັບ ໃຊ້ງານ",
  all: "ທັງໝົດ",
  approvalRequired: "ຕ້ອງອະນຸມັດກ່ອນ.",
  archive: "ເກັບຖາວອນ",
  archiveConfirm: "ຢຸດໃຊ້ ລະດັບສະມາຊິກ?",
  archiveFailed: "ເກັບຖາວອນ ລະດັບ ບໍ່ສຳເລັດ.",
  archived: "ເກັບຖາວອນ ລະດັບ.",
  backToMembership: "ກັບໄປສະມາຊິກ",
  cancel: "ຍົກເລີກ",
  clearFilters: "ລ້າງການເລືອກ",
  close: "ປິດ",
  createLevel: "ສ້າງ ລະດັບ",
  created: "ສ້າງ ລະດັບສະມາຊິກ.",
  customers: "ລູກຄ້າ",
  customersInLevels: "ລູກຄ້າ ລະດັບ",
  delete: "ລຶບ",
  deleteConfirm: "ລຶບ ລະດັບສະມາຊິກ? ເກັບຖາວອນ.",
  deleteFailed: "ລຶບ ລະດັບ ບໍ່ສຳເລັດ.",
  deletedOrArchived: "ລຶບ / ເກັບຖາວອນ ລະດັບ.",
  discountPercent: "% ສ່ວນຫຼຸດ",
  discountRange: "% ສ່ວນຫຼຸດ 0-100.",
  edit: "ແກ້ໄຂ",
  editLevel: "ແກ້ໄຂ ລະດັບ",
  failedToLoad: "ໂຫຼດສະມາຊິກບໍ່ສຳເລັດ.",
  filters: "ກັ່ນຕອງຕາມສະຖານະ",
  futureRulesNote: "% ສ່ວນຫຼຸດ, duration, points: Settings / ພາຍຫຼັງ.",
  highestDiscount: "% ສ່ວນຫຼຸດ",
  inactive: "ຢຸດໃຊ້",
  inactiveLevels: "ລະດັບ ຢຸດໃຊ້",
  levelInformation: "ຂໍ້ມູນລະດັບ",
  levelName: "ຊື່ ລະດັບ",
  loadingMemberships: "ກຳລັງໂຫຼດສະມາຊິກ...",
  loyaltyNote: "Settings. ແກ້ໄຂ ລະດັບສະມາຊິກ.",
  membership: "ສະມາຊິກ",
  membershipLevels: "ລະດັບສະມາຊິກ",
  membershipRules: "ສະມາຊິກ",
  membershipRulesNote: "% ສ່ວນຫຼຸດ / ຍອດຊື້ລວມ.",
  minSpendNegative: "ຍອດຊື້ລວມ < 0.",
  minimumSpend: "ຍອດຊື້ລວມ",
  nameRequired: "ຊື່ ລະດັບ.",
  noLevelsFound: "ບໍ່ພົບລະດັບສະມາຊິກ.",
  openActions: "ຄຳສັ່ງ {name}",
  permissionDenied: "ບໍ່ມີສິດ.",
  posDiscountNote: "POS % ສ່ວນຫຼຸດ ສະມາຊິກ ໃຊ້ງານ.",
  promotions: "Promotions",
  retry: "ລອງໃໝ່",
  saveFailed: "ບັນທຶກ ລະດັບ ບໍ່ສຳເລັດ.",
  saveLevel: "ບັນທຶກ ລະດັບ",
  saving: "ກຳລັງບັນທຶກ",
  searchLevels: "ຄົ້ນຫາ ລະດັບ",
  status: "ສະຖານະ",
  subtitle: "ລະດັບສະມາຊິກ: ຊື່, ຍອດຊື້ລວມ, % ສ່ວນຫຼຸດ, ສະຖານະ.",
  updated: "ແກ້ໄຂ ລະດັບ.",
  view: "ເບິ່ງ",
};

export type MembershipsCopyKey = keyof typeof en;
export type MembershipsCopy = Record<MembershipsCopyKey, string>;

const dictionaries: Record<"en" | "lo", MembershipsCopy> = { en, lo: lo as MembershipsCopy };
export const MEMBERSHIPS_COPY = dictionaries;

function resolveMembershipsLocale(locale?: string | null): "en" | "lo" {
  if (locale) {
    return normalizeLocale(locale);
  }
  if (typeof document !== "undefined") {
    return normalizeLocale(document.documentElement.dataset.locale);
  }
  return "en";
}

export function getMembershipsCopy(locale?: string | null): MembershipsCopy {
  return dictionaries[resolveMembershipsLocale(locale)];
}

export function tMemberships(key: string, locale?: string | null) {
  const copy = getMembershipsCopy(locale);
  if (key in copy) {
    return copy[key as MembershipsCopyKey];
  }
  return en[key as MembershipsCopyKey] ?? key;
}

export function fillMembershipsCopy(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function membershipsCopyKeyParity() {
  const enKeys = Object.keys(en).sort();
  const loKeys = Object.keys(lo).sort();
  return enKeys.length === loKeys.length && enKeys.every((key, index) => key === loKeys[index]);
}

export function membershipsCopyHasNoReplacementChars() {
  return !Object.values(lo).some((value) => value.includes("\uFFFD"));
}

export function membershipStatusLabel(active: boolean, locale?: string | null) {
  return tMemberships(active ? "active" : "inactive", locale);
}

const knownErrors: Record<string, MembershipsCopyKey> = {
  "Membership level name is required.": "nameRequired",
  "name is required.": "nameRequired",
  "Membership level save failed.": "saveFailed",
  "Membership level archive failed.": "archiveFailed",
  "Membership level delete failed.": "deleteFailed",
};

export function localizeMembershipError(error?: string | null, locale?: string | null) {
  if (!error) {
    return tMemberships("failedToLoad", locale);
  }
  if (error.startsWith("Permission denied")) {
    return tMemberships("permissionDenied", locale);
  }
  if (error.startsWith("Approval required") || error.includes("approval required")) {
    return tMemberships("approvalRequired", locale);
  }
  const exact = knownErrors[error];
  if (exact) {
    return tMemberships(exact, locale);
  }
  if (error.startsWith("name is required")) {
    return tMemberships("nameRequired", locale);
  }
  return error;
}
