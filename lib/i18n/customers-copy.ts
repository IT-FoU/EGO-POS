import { normalizeLocale } from "@/lib/i18n/locale";

const en = {
  action: "Action",
  activeCustomers: "Active Customers",
  address: "Address",
  allSegments: "All segments",
  allStatuses: "All statuses",
  amount: "Amount",
  amountLak: "Amount LAK",
  analyticsHint: "Product/category analytics will use sale item history when full report aggregation is connected.",
  approvalRequired: "Approval required.",
  autoMemCode: "Auto MEM-000001",
  availablePoints: "Available Points",
  averageSpend: "Average Spend",
  backToCustomers: "Back to customers",
  balance: "Balance",
  birthday: "Birthday",
  birthdayCustomers: "Birthday Customers",
  birthdayThisMonth: "Birthday This Month",
  birthdayThisMonthTitle: "Birthday Customers This Month",
  categoryBreakdown: "Category breakdown",
  categoryDrinks: "Drinks",
  categoryHousehold: "Household",
  categorySnacks: "Snacks",
  close: "Close",
  createCustomer: "Create customer",
  createCustomerSubtitle: "Create a customer profile with membership, credit limit, opening balance, birthday, and notes.",
  createCustomerTitle: "Create customer",
  creditBalance: "Credit Balance",
  creditCustomer: "Credit Customer",
  creditDetail: "Credit Detail",
  creditHistory: "Credit History",
  creditLimit: "Credit Limit",
  csvExcelPlaceholder: "CSV and Excel workflow placeholder",
  currentPoints: "Current Points",
  customerAnalytics: "Customer Analytics",
  customerCode: "Customer code",
  customerCreditDetail: "Customer Credit Detail",
  customerInformation: "Customer information",
  customerManagement: "Customer Management",
  customerPaymentFailed: "Customer payment failed.",
  customerPaymentSaved: "Customer payment saved successfully.",
  customerSaveFailed: "Customer save failed.",
  customerSaved: "Customer saved successfully.",
  customers: "Customers",
  customersFound: "{count} customers found",
  customersSubtitle: "Customer profiles with membership, loyalty points, credit, purchase behavior, segmentation, birthdays, and analytics.",
  customersWithDebt: "Customers With Debt",
  customersWithPoints: "Customers With Points",
  customerUpdateFailed: "Customer update failed.",
  customerUpdated: "Customer updated successfully.",
  databaseStatus: "Database status",
  date: "Date",
  discount: "% discount",
  dismiss: "Dismiss",
  earned: "Earned",
  earnedPoints: "Earned points",
  editProfile: "Edit profile",
  email: "Email",
  emailPlaceholder: "customer@example.com",
  exportCsv: "Export CSV",
  exportCustomers: "Export Customers",
  exportExcel: "Export Excel",
  exportHint: "Export all filtered customers to CSV or Excel later. Current screen confirms the entry point and export options.",
  exportWorkflow: "Export workflow",
  failedToLoad: "Failed to load customers.",
  favoriteCategories: "Favorite Categories",
  favoriteProducts: "Favorite Products",
  favoriteProductsSample: "Water 500ml, Pepsi Can, Lay's Classic",
  filterBySegment: "Filter by customer segment",
  filterByStatus: "Filter by customer status",
  fullName: "Full Name",
  fullNamePlaceholder: "Customer full name",
  generalInformation: "General Information",
  highValue: "High Value",
  importCustomers: "Import Customers",
  importHint: "Upload CSV or Excel customer files here later. The backend import parser and duplicate validation will be connected in a future phase.",
  importWorkflow: "Import workflow",
  internalNotes: "Internal Notes",
  invalidDate: "Invalid date.",
  lastPurchase: "Last Purchase",
  lastPurchaseDate: "Last Purchase Date",
  lakCredit: "{amount} LAK credit",
  lakSpent: "{amount} LAK spent",
  level: "Level",
  levelGold: "Gold",
  levelPlatinum: "Platinum",
  levelSilver: "Silver",
  levelStandard: "Standard",
  lifetimeSpending: "Lifetime Spending",
  loadingCustomers: "Loading customers...",
  localPreview: "Local preview",
  lostCustomers: "Lost Customers",
  member: "Member",
  memberReference: "Member Reference",
  membership: "Membership",
  membershipBarcode: "Membership Barcode",
  membershipLevel: "Membership Level",
  membershipQrCard: "Membership QR Card",
  membershipStatus: "Membership Status",
  method: "Method",
  monthApr: "Apr",
  monthAug: "Aug",
  monthDec: "Dec",
  monthFeb: "Feb",
  monthJan: "Jan",
  monthJul: "Jul",
  monthJun: "Jun",
  monthMar: "Mar",
  monthMay: "May",
  monthNov: "Nov",
  monthOct: "Oct",
  monthSep: "Sep",
  name: "Name",
  nameRequired: "Name is required.",
  newCustomersThisMonth: "New Customers This Month",
  noBirthdaysThisMonth: "No birthdays this month.",
  noCustomers: "No customers",
  noCustomersForCard: "No customers found for this card.",
  noCustomersMatch: "No customers match the current search and filters.",
  noInternalNotes: "No internal notes recorded.",
  noMembers: "No members",
  noMembership: "No Membership",
  noNotes: "No notes recorded.",
  noPayments: "No payments for this customer.",
  noPointsHistory: "No points history",
  noPurchases: "No purchases for this customer.",
  noResults: "No results",
  note: "Note",
  notes: "Notes",
  notesPlaceholder: "Customer notes",
  notesTags: "Notes & Tags",
  openingBalance: "Opening Balance",
  openingEarnedPoints: "Opening earned points",
  outstanding: "Outstanding",
  outstandingBalance: "Outstanding Balance",
  outstandingBalanceCustomers: "Outstanding Balance Customers",
  overdue: "Overdue",
  paidCustomer: "Paid Customer",
  payment: "Payment",
  paymentHistory: "Payment history",
  paymentMethodBank: "bank",
  paymentMethodCash: "cash",
  paymentMethodCredit: "credit",
  paymentMethodMixed: "mixed",
  paymentMethodQr: "QR",
  paymentMethodTransfer: "transfer",
  paymentNo: "Payment no",
  paymentNote: "Payment note",
  paymentsRecorded: "Payments Recorded",
  permissionDenied: "Permission denied.",
  phone: "Phone",
  phoneLookup: "Phone lookup",
  phonePlaceholder: "+856 20 ...",
  phoneRequired: "Phone is required.",
  placeholderAddress: "Customer address",
  points: "Points",
  pointsAmount: "{amount} points",
  pointsAvailable: "{amount} points available",
  pointsEarned: "Points earned",
  pointsHistory: "Points History",
  pointsRule: "1 point / 10,000 LAK",
  profile: "Profile",
  purchaseHistory: "Purchase History",
  realDatabase: "Real database",
  recordPayment: "Record payment",
  redeemed: "Redeemed",
  redeemedPoints: "Redeemed points",
  reference: "Reference",
  remainingCredit: "Remaining credit",
  retry: "Retry",
  saleNo: "Sale no",
  save: "Save",
  savePayment: "Save payment",
  saveProfile: "Save profile",
  saving: "Saving...",
  searchCustomers: "Search code, name, phone, email, membership",
  segment: "Segment",
  segmentInactive: "inactive",
  segmentLost: "lost",
  segmentNew: "new",
  segmentRegular: "regular",
  segmentVip: "vip",
  selectCsvExcel: "Select CSV / Excel File",
  status: "Status",
  statusActive: "Active",
  statusInactive: "Inactive",
  tagInactive: "Inactive",
  topCustomers: "Top Customers",
  total: "Total",
  totalPurchases: "Total purchases",
  totalVisits: "Total Visits",
  view: "View",
  viewList: "View list",
  vipCustomers: "VIP Customers",
  visitsCount: "{count} visits",
};

const lo = {
  action: "ຄຳສັ່ງ",
  activeCustomers: "ລູກຄ້າໃຊ້ງານ",
  address: "ທີ່ຢູ່",
  allSegments: "ທຸກກຸ່ມ",
  allStatuses: "ທຸກສະຖານະ",
  amount: "ຈຳນວນ",
  amountLak: "ຈຳນວນ LAK",
  analyticsHint: "ວິເຄາະໝວດ/ສິນຄ້າ ພາຍຫຼັງ.",
  approvalRequired: "ຕ້ອງອະນຸມັດກ່ອນ.",
  autoMemCode: "Auto MEM-000001",
  availablePoints: "ຄະແນນຄົງເຫຼືອ",
  averageSpend: "ສະເລ່ຍຕໍ່ຄັ້ງຢ້ຽມ",
  backToCustomers: "ກັບໄປລູກຄ້າ",
  balance: "ຍອດຄົງ",
  birthday: "ວັນເກີດ",
  birthdayCustomers: "ລູກຄ້າວັນເກີດ",
  birthdayThisMonth: "ວັນເກີດເດືອນນີ້",
  birthdayThisMonthTitle: "ລູກຄ້າວັນເກີດເດືອນນີ້",
  categoryBreakdown: "ແຍກຕາມໝວດ",
  categoryDrinks: "ເຄື່ອງດື່ມ",
  categoryHousehold: "ຂອງໃຊ້ໃນບ້ານ",
  categorySnacks: "ຂະໜົມ",
  close: "ປິດ",
  createCustomer: "ສ້າງລູກຄ້າ",
  createCustomerSubtitle: "ສ້າງໂປຣໄຟລ໌ລູກຄ້າ ພ້ອມສະມາຊິກ, ເຄຣດິດ, ວັນເກີດ,  ແລະ ໝາຍເຫດ.",
  createCustomerTitle: "ສ້າງລູກຄ້າ",
  creditBalance: "ຍອດຄົງ ເຄຣດິດ",
  creditCustomer: "ລູກຄ້າເຄຣດິດ",
  creditDetail: "ລາຍລະອຽດເຄຣດິດ",
  creditHistory: "ປະຫວັດເຄຣດິດ",
  creditLimit: "ເຄຣດິດສູງສຸດ",
  csvExcelPlaceholder: "ວຽກ CSV ແລະ Excel ເຊື່ອມ ພາຍຫຼັງ",
  currentPoints: "ຄະແນນປັດຈຸບັນ",
  customerAnalytics: "ວິເຄາະລູກຄ້າ",
  customerCode: "ລະຫັດລູກຄ້າ",
  customerCreditDetail: "ລາຍລະອຽດເຄຣດິດລູກຄ້າ",
  customerInformation: "ຂໍ້ມູນລູກຄ້າ",
  customerManagement: "ຈັດການລູກຄ້າ",
  customerPaymentFailed: "ບັນທຶກການຈ່າຍບໍ່ສຳເລັດ.",
  customerPaymentSaved: "ບັນທຶກການຈ່າຍສຳເລັດ.",
  customers: "ລູກຄ້າ",
  customerSaved: "ບັນທຶກລູກຄ້າສຳເລັດ.",
  customerSaveFailed: "ບັນທຶກລູກຄ້າບໍ່ສຳເລັດ.",
  customersFound: "ພົບ {count} ລູກຄ້າ",
  customersSubtitle: "ໂປຣໄຟລ໌ລູກຄ້າ ພ້ອມສະມາຊິກ, ຄະແນນ, ເຄຣດິດ, ກຸ່ມ, ວັນເກີດ.",
  customersWithDebt: "ລູກຄ້າມີໜີ້",
  customersWithPoints: "ລູກຄ້າມີຄະແນນ",
  customerUpdated: "ອັບເດດລູກຄ້າສຳເລັດ.",
  customerUpdateFailed: "ອັບເດດລູກຄ້າບໍ່ສຳເລັດ.",
  databaseStatus: "ສະຖານະຖານຂໍ້ມູນ",
  date: "ວັນທີ",
  discount: "% ສ່ວນຫຼຸດ",
  dismiss: "ປິດ",
  earned: "ໄດ້",
  earnedPoints: "ຄະແນນທີ່ໄດ້",
  editProfile: "ແກ້ໄຂໂປຣໄຟລ໌",
  email: "ອີເມວ",
  emailPlaceholder: "customer@example.com",
  exportCsv: "ສົ່ງອອກ CSV",
  exportCustomers: "ສົ່ງອອກລູກຄ້າ",
  exportExcel: "ສົ່ງອອກ Excel",
  exportHint: "ສົ່ງອອກລູກຄ້າ CSV ຫຼື Excel ພາຍຫຼັງ.",
  exportWorkflow: "ວຽກສົ່ງອອກ",
  failedToLoad: "ໂຫຼດລູກຄ້າບໍ່ສຳເລັດ.",
  favoriteCategories: "ໝວດທີ່ມັກ",
  favoriteProducts: "ສິນຄ້າທີ່ມັກ",
  favoriteProductsSample: "Water 500ml, Pepsi Can, Lay's Classic",
  filterBySegment: "ກັ່ນຕອງຕາມກຸ່ມ",
  filterByStatus: "ກັ່ນຕອງຕາມສະຖານະ",
  fullName: "ຊື່ເຕັມ",
  fullNamePlaceholder: "ຊື່ເຕັມລູກຄ້າ",
  generalInformation: "ຂໍ້ມູນທົ່ວໄປ",
  highValue: "ມູນຄ່າສູງ",
  importCustomers: "ນຳເຂົ້າລູກຄ້າ",
  importHint: "ອັບໂຫຼດ ໄຟລ໌ CSV ຫຼື Excel ພາຍຫຼັງ.",
  importWorkflow: "ວຽກນຳເຂົ້າ",
  internalNotes: "ໝາຍເຫດພາຍໃນ",
  invalidDate: "ວັນທີ ບໍ່ຖືກຕ້ອງ.",
  lakCredit: "ເຄຣດິດ {amount} LAK",
  lakSpent: "ຊື້ {amount} LAK",
  lastPurchase: "ຊື້ຫຼ້າສຸດ",
  lastPurchaseDate: "ວັນທີຊື້ຫຼ້າສຸດ",
  level: "ລະດັບ",
  levelGold: "ຄຳ",
  levelPlatinum: "Platinum",
  levelSilver: "ເງິນ",
  levelStandard: "ມາດຕະຖານ",
  lifetimeSpending: "ຍອດຊື້ລວມ",
  loadingCustomers: "ກຳລັງໂຫຼດລູກຄ້າ...",
  localPreview: "ຕົວຢ່າງທ້ອງຖິ່ນ",
  lostCustomers: "ລູກຄ້າຫາຍໄປ",
  member: "ສະມາຊິກ",
  memberReference: "ລະຫັດອ້າງອີງ",
  membership: "ສະມາຊິກ",
  membershipBarcode: "Barcode ສະມາຊິກ",
  membershipLevel: "ລະດັບສະມາຊິກ",
  membershipQrCard: "ບັດ QR ສະມາຊິກ",
  membershipStatus: "ສະຖານະສະມາຊິກ",
  method: "ວິທີ",
  monthApr: "ເມ.ສ.",
  monthAug: "ສ.ຫ.",
  monthDec: "ທ.ວ.",
  monthFeb: "ກ.ພ.",
  monthJan: "ມ.ກ.",
  monthJul: "ກ.ລ.",
  monthJun: "ມິ.ຖ.",
  monthMar: "ມ.ນ.",
  monthMay: "ພ.ພ.",
  monthNov: "ພ.ຈ.",
  monthOct: "ຕ.ລ.",
  monthSep: "ກ.ຍ.",
  name: "ຊື່",
  nameRequired: "ຕ້ອງໃສ່ຊື່.",
  newCustomersThisMonth: "ລູກຄ້າໃໝ່ເດືອນນີ້",
  noBirthdaysThisMonth: "ບໍ່ມີວັນເກີດເດືອນນີ້.",
  noCustomers: "ບໍ່ມີລູກຄ້າ",
  noCustomersForCard: "ບໍ່ພົບລູກຄ້າ.",
  noCustomersMatch: "ບໍ່ພົບລູກຄ້າ.",
  noInternalNotes: "ບໍ່ມີໝາຍເຫດພາຍໃນ.",
  noMembers: "ບໍ່ມີສະມາຊິກ",
  noMembership: "ບໍ່ມີສະມາຊິກ",
  noNotes: "ບໍ່ມີໝາຍເຫດ.",
  noPayments: "ບໍ່ມີປະຫວັດຈ່າຍ.",
  noPointsHistory: "ບໍ່ມີປະຫວັດຄະແນນ",
  noPurchases: "ບໍ່ມີປະຫວັດຊື້.",
  noResults: "ບໍ່ພົບຜົນ",
  note: "ໝາຍເຫດ",
  notes: "ໝາຍເຫດ",
  notesPlaceholder: "ໝາຍເຫດລູກຄ້າ",
  notesTags: "ໝາຍເຫດ ແລະ ແທັກ",
  openingBalance: "ຍອດເປີດ",
  openingEarnedPoints: "ຄະແນນເປີດ",
  outstanding: "ຍອດຄ້າງ",
  outstandingBalance: "ຍອດຄ້າງ",
  outstandingBalanceCustomers: "ລູກຄ້າຍອດຄ້າງ",
  overdue: "ເກີນກຳນົດ",
  paidCustomer: "ລູກຄ້າຈ່າຍແລ້ວ",
  payment: "ການຈ່າຍ",
  paymentHistory: "ປະຫວັດຈ່າຍ",
  paymentMethodBank: "ທະນາຄານ",
  paymentMethodCash: "ເງິນສົດ",
  paymentMethodCredit: "ເຄຣດິດ",
  paymentMethodMixed: "ປະສົມ",
  paymentMethodQr: "QR",
  paymentMethodTransfer: "ໂອນ",
  paymentNo: "ເລກຈ່າຍ",
  paymentNote: "ໝາຍເຫດການຈ່າຍ",
  paymentsRecorded: "ບັນທຶກການຈ່າຍ",
  permissionDenied: "ບໍ່ມີສິດ.",
  phone: "ໂທ",
  phoneLookup: "ຄົ້ນຫາດ້ວຍເບີໂທ",
  phonePlaceholder: "+856 20 ...",
  phoneRequired: "ຕ້ອງໃສ່ເບີໂທ.",
  placeholderAddress: "ທີ່ຢູ່ລູກຄ້າ",
  points: "ຄະແນນ",
  pointsAmount: "{amount} ຄະແນນ",
  pointsAvailable: "ຄະແນນຄົງເຫຼືອ {amount}",
  pointsEarned: "ຄະແນນທີ່ໄດ້",
  pointsHistory: "ປະຫວັດຄະແນນ",
  pointsRule: "1 ຄະແນນ / 10,000 LAK",
  profile: "ໂປຣໄຟລ໌",
  purchaseHistory: "ປະຫວັດຊື້",
  realDatabase: "ຖານຂໍ້ມູນຈິງ",
  recordPayment: "ບັນທຶກການຈ່າຍ",
  redeemed: "ໃຊ້",
  redeemedPoints: "ຄະແນນທີ່ໃຊ້",
  reference: "ອ້າງອີງ",
  remainingCredit: "ເຄຣດິດຄົງເຫຼືອ",
  retry: "ລອງໃໝ່",
  saleNo: "ເລກຂາຍ",
  save: "ບັນທຶກ",
  savePayment: "ບັນທຶກການຈ່າຍ",
  saveProfile: "ບັນທຶກໂປຣໄຟລ໌",
  saving: "ກຳລັງບັນທຶກ...",
  searchCustomers: "ຄົ້ນຫາ ລະຫັດ, ຊື່, ໂທ, ອີເມວ, ສະມາຊິກ",
  segment: "ກຸ່ມ",
  segmentInactive: "ຢຸດໃຊ້",
  segmentLost: "ຫາຍໄປ",
  segmentNew: "ໃໝ່",
  segmentRegular: "ປົກກະຕິ",
  segmentVip: "VIP",
  selectCsvExcel: "ເລືອກໄຟລ໌ CSV / Excel",
  status: "ສະຖານະ",
  statusActive: "ໃຊ້ງານ",
  statusInactive: "ຢຸດໃຊ້",
  tagInactive: "ຢຸດໃຊ້",
  topCustomers: "ລູກຄ້າຍອດນິຍົມ",
  total: "ລວມ",
  totalPurchases: "ຍອດຊື້ລວມ",
  totalVisits: "ຄັ້ງຢ້ຽມ",
  view: "ເບິ່ງ",
  viewList: "ເບິ່ງລາຍການ",
  vipCustomers: "ລູກຄ້າ VIP",
  visitsCount: "{count} ຄັ້ງຢ້ຽມ",
};

export type CustomersCopyKey = keyof typeof en;
export type CustomersCopy = Record<CustomersCopyKey, string>;

const dictionaries: Record<"en" | "lo", CustomersCopy> = { en, lo: lo as CustomersCopy };
export const CUSTOMERS_COPY = dictionaries;

function resolveCustomersLocale(locale?: string | null): "en" | "lo" {
  if (locale) {
    return normalizeLocale(locale);
  }
  if (typeof document !== "undefined") {
    return normalizeLocale(document.documentElement.dataset.locale);
  }
  return "en";
}

export function getCustomersCopy(locale?: string | null): CustomersCopy {
  return dictionaries[resolveCustomersLocale(locale)];
}

export function tCustomers(key: string, locale?: string | null) {
  const copy = getCustomersCopy(locale);
  if (key in copy) {
    return copy[key as CustomersCopyKey];
  }
  return en[key as CustomersCopyKey] ?? key;
}

export function fillCustomersCopy(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function customersCopyKeyParity() {
  const enKeys = Object.keys(en).sort();
  const loKeys = Object.keys(lo).sort();
  return enKeys.length === loKeys.length && enKeys.every((key, index) => key === loKeys[index]);
}

export function customersCopyHasNoReplacementChars() {
  return !Object.values(lo).some((value) => value.includes("\uFFFD"));
}

const knownLevels: Record<string, CustomersCopyKey> = {
  Gold: "levelGold",
  Platinum: "levelPlatinum",
  Silver: "levelSilver",
  Standard: "levelStandard",
};

export function localizedMembershipLabel(level: string | null | undefined, locale?: string | null) {
  if (!level || level.trim().length === 0) {
    return tCustomers("noMembership", locale);
  }
  const key = knownLevels[level];
  return key ? tCustomers(key, locale) : level;
}

export function customerStatusLabel(status: string, locale?: string | null) {
  if (status === "active") return tCustomers("statusActive", locale);
  if (status === "inactive") return tCustomers("statusInactive", locale);
  return status;
}

export function customerSegmentLabel(segment: string, locale?: string | null) {
  const map: Record<string, CustomersCopyKey> = {
    inactive: "segmentInactive",
    lost: "segmentLost",
    new: "segmentNew",
    regular: "segmentRegular",
    vip: "segmentVip",
  };
  const key = map[segment];
  return key ? tCustomers(key, locale) : segment;
}

export function customerPaymentMethodLabel(method: string, locale?: string | null) {
  const map: Record<string, CustomersCopyKey> = {
    bank: "paymentMethodBank",
    cash: "paymentMethodCash",
    credit: "paymentMethodCredit",
    mixed: "paymentMethodMixed",
    qr: "paymentMethodQr",
    transfer: "paymentMethodTransfer",
  };
  const key = map[method];
  return key ? tCustomers(key, locale) : method;
}

export function formatCustomerDisplayDate(value: string | undefined, locale?: string | null) {
  if (!value) {
    return "--";
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const months = [
    tCustomers("monthJan", locale),
    tCustomers("monthFeb", locale),
    tCustomers("monthMar", locale),
    tCustomers("monthApr", locale),
    tCustomers("monthMay", locale),
    tCustomers("monthJun", locale),
    tCustomers("monthJul", locale),
    tCustomers("monthAug", locale),
    tCustomers("monthSep", locale),
    tCustomers("monthOct", locale),
    tCustomers("monthNov", locale),
    tCustomers("monthDec", locale),
  ];
  if (!year || !month || !day) {
    return value;
  }
  return `${day} ${months[month - 1]} ${year}`;
}

const knownErrors: Record<string, CustomersCopyKey> = {
  "Phone is required.": "phoneRequired",
  "fullName is required.": "nameRequired",
  "Customer save failed.": "customerSaveFailed",
  "Customer saved successfully.": "customerSaved",
  "Customer update failed.": "customerUpdateFailed",
  "Customer updated successfully.": "customerUpdated",
  "Customer payment failed.": "customerPaymentFailed",
  "Customer payment saved successfully.": "customerPaymentSaved",
};

const knownErrorPrefixes: Array<{ prefix: string; key: CustomersCopyKey }> = [
  { prefix: "fullName is required", key: "nameRequired" },
  { prefix: "Phone is required", key: "phoneRequired" },
  { prefix: "birthday must be a valid date", key: "invalidDate" },
];

export function localizeCustomerError(error?: string | null, locale?: string | null) {
  if (!error) {
    return tCustomers("failedToLoad", locale);
  }
  if (error.startsWith("Permission denied")) {
    return tCustomers("permissionDenied", locale);
  }
  if (error.startsWith("Approval required") || error.includes("approval required")) {
    return tCustomers("approvalRequired", locale);
  }
  const exact = knownErrors[error];
  if (exact) {
    return tCustomers(exact, locale);
  }
  const prefixed = knownErrorPrefixes.find((entry) => error.startsWith(entry.prefix));
  if (prefixed) {
    return tCustomers(prefixed.key, locale);
  }
  return error;
}
