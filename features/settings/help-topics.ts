import type { SupportedLocale } from "@/lib/constants";

export type HelpTopic = {
  body: { en: string; lo: string };
  hrefs: Array<{ href: string; label: { en: string; lo: string } }>;
  id: string;
  keywords: string;
  steps: { en: string[]; lo: string[] };
  title: { en: string; lo: string };
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: { en: "Getting Started", lo: "ເລີ່ມຕົ້ນໃຊ້ງານ" },
    keywords: "getting started start setup onboarding ເລີ່ມຕົ້ນ ຕິດຕັ້ງ",
    body: {
      en: "Use Settings to manage store identity, payments, staff access, and loyalty. Open each item from the Settings list — there is no global Save on the landing page.",
      lo: "ໃຊ້ຕັ້ງຄ່າເພື່ອຈັດການຂໍ້ມູນຮ້ານ, ການຊຳລະ, ສິດພະນັກງານ, ແລະ ຄະແນນ. ເປີດແຕ່ລະລາຍການຈາກລາຍການຕັ້ງຄ່າ — ໜ້າຫຼັກບໍ່ມີປຸ່ມບັນທຶກທົ່ວໄປ.",
    },
    steps: {
      en: [
        "Open Settings from the sidebar.",
        "Choose a category item to open its detail page.",
        "Save changes on that page only.",
        "Use Back to Settings to return to the list.",
      ],
      lo: [
        "ເປີດຕັ້ງຄ່າຈາກແຖບດ້ານຂ້າງ.",
        "ເລືອກລາຍການເພື່ອເປີດໜ້າລາຍລະອຽດ.",
        "ບັນທຶກການປ່ຽນແປງຢູ່ໜ້ານັ້ນເທົ່ານັ້ນ.",
        "ກົດກັບໄປຕັ້ງຄ່າເພື່ອກັບຄືນລາຍການ.",
      ],
    },
    hrefs: [{ href: "/settings", label: { en: "Open Settings", lo: "ເປີດຕັ້ງຄ່າ" } }],
  },
  {
    id: "cash-shift",
    title: { en: "Cash Shift", lo: "ກະເງິນສົດ" },
    keywords: "cash shift start work required sale ກະ ເງິນສົດ ເລີ່ມວຽກ",
    body: {
      en: "Cash Shift controls whether a sale requires an open shift. Cash In, Cash Out, and Close Session still need an open session even when the requirement is off.",
      lo: "ກະເງິນສົດກຳນົດວ່າຕ້ອງເປີດກະກ່ອນຂາຍຫຼືບໍ່. ການເພີ່ມ/ຖອນເງິນ ແລະ ປິດກະຍັງຕ້ອງມີກະເປີດຢູ່ ເຖິງວ່າຈະປິດການບັງຄັບກໍຕາມ.",
    },
    steps: {
      en: [
        "Open Settings → Cash Shift.",
        "Turn the requirement on or off for this company.",
        "Save, then confirm the cashier Start Work flow on POS.",
      ],
      lo: [
        "ເປີດ ຕັ້ງຄ່າ → ກະເງິນສົດ.",
        "ເປີດ ຫຼື ປິດການບັງຄັບສຳລັບບໍລິສັດນີ້.",
        "ບັນທຶກ ແລ້ວກວດການເລີ່ມວຽກຢູ່ POS.",
      ],
    },
    hrefs: [{ href: "/settings/cash-shift", label: { en: "Cash Shift settings", lo: "ຕັ້ງຄ່າກະເງິນສົດ" } }],
  },
  {
    id: "receipt",
    title: { en: "Receipt & Printing", lo: "ໃບບິນ ແລະ ການພິມ" },
    keywords: "receipt printing header footer logo auto ask ໃບບິນ ພິມ",
    body: {
      en: "Company receipt text is shared across devices. Print mode (Ask every time / Auto print / Do not auto print) is saved only in this browser.",
      lo: "ເນື້ອຫາໃບບິນຂອງບໍລິສັດແບ່ງປັນທຸກອຸປະກອນ. ໂໝດພິມ (ຖາມທຸກຄັ້ງ / ພິມອັດຕະໂນມັດ / ບໍ່ພິມອັດຕະໂນມັດ) ບັນທຶກເກັບໄວ້ໃນໂປຣແກຣມນີ້ເທົ່ານັ້ນ.",
    },
    steps: {
      en: [
        "Edit header, footer, prefix, and logo toggle under Receipt & Printing.",
        "Choose print behavior for this device only.",
        "Save company receipt fields separately from the local print mode.",
      ],
      lo: [
        "ແກ້ໄຂສ່ວນຫົວ, ທ້າຍ, ຄຳນຳໜ້າ, ແລະ ສະຫຼັບໂລໂກ້ໃນ ໃບບິນ ແລະ ການພິມ.",
        "ເລືອກພຶດຕິກຳການພິມສຳລັບອຸປະກອນນີ້ເທົ່ານັ້ນ.",
        "ບັນທຶກເນື້ອຫາໃບບິນຂອງບໍລິສັດແຍກຈາກໂໝດພິມໃນອຸປະກອນ.",
      ],
    },
    hrefs: [{ href: "/settings/receipt", label: { en: "Receipt settings", lo: "ຕັ້ງຄ່າໃບບິນ" } }],
  },
  {
    id: "qr-payments",
    title: { en: "QR Payments", lo: "ການຊຳລະ QR" },
    keywords: "qr payments bank account branch print receipt ຊຳລະ ທະນາຄານ",
    body: {
      en: "Manage banks and branch QR accounts here. Receipt QR prints only when the sale is attributable to an account that has Print on receipt enabled.",
      lo: "ຈັດການທະນາຄານ ແລະ ບັນຊີ QR ປະຈຳສາຂາຢູ່ນີ້. QR ໃນໃບບິນຈະພິມເມື່ອການຂາຍອ້າງອີງບັນຊີທີ່ເປີດພິມໃນໃບບິນເທົ່ານັ້ນ.",
    },
    steps: {
      en: [
        "Add or activate banks first.",
        "Create QR accounts for the correct branch.",
        "Set one default active account per branch when needed.",
        "Enable Print on receipt only for accounts that should appear.",
      ],
      lo: [
        "ເພີ່ມ ຫຼື ເປີດໃຊ້ທະນາຄານກ່ອນ.",
        "ສ້າງບັນຊີ QR ໃຫ້ຖືກສາຂາ.",
        "ຕັ້ງບັນຊີເລີ່ມຕົ້ນທີ່ເປີດໃຊ້ໜຶ່ງບັນຊີຕໍ່ສາຂາເມື່ອຈຳເປັນ.",
        "ເປີດພິມໃນໃບບິນສຳລັບບັນຊີທີ່ຕ້ອງສະແດງເທົ່ານັ້ນ.",
      ],
    },
    hrefs: [{ href: "/settings/qr-payments", label: { en: "QR Payments settings", lo: "ຕັ້ງຄ່າ QR" } }],
  },
  {
    id: "products",
    title: { en: "Products", lo: "ສິນຄ້າ" },
    keywords: "products catalogue barcode stock inventory ສິນຄ້າ ບາໂຄດ",
    body: {
      en: "Products are managed in the Products module, not inside Settings. Use Products to create items, units, prices, and barcodes for POS discovery.",
      lo: "ສິນຄ້າຈັດການໃນໂມດູນສິນຄ້າ ບໍ່ແມ່ນໃນຕັ້ງຄ່າ. ໃຊ້ສິນຄ້າເພື່ອສ້າງລາຍການ, ຫົວໜ່ວຍ, ລາຄາ, ແລະ ບາໂຄດສຳລັບ POS.",
    },
    steps: {
      en: [
        "Open Products from the sidebar.",
        "Create or edit a product with units and prices.",
        "Confirm the item appears in POS search or barcode scan.",
      ],
      lo: [
        "ເປີດສິນຄ້າຈາກແຖບດ້ານຂ້າງ.",
        "ສ້າງ ຫຼື ແກ້ໄຂສິນຄ້າພ້ອມຫົວໜ່ວຍ ແລະ ລາຄາ.",
        "ກວດວ່າລາຍການປາກົດໃນການຄົ້ນຫາ ຫຼື ສະແກນບາໂຄດຢູ່ POS.",
      ],
    },
    hrefs: [{ href: "/products", label: { en: "Open Products", lo: "ເປີດສິນຄ້າ" } }],
  },
  {
    id: "staff-permissions",
    title: { en: "Staff & Permissions", lo: "ພະນັກງານ ແລະ ສິດ" },
    keywords: "staff roles permissions approval owner manager ພະນັກງານ ສິດ ອະນຸມັດ",
    body: {
      en: "Staff accounts, roles, and approval rules live under Staff & Security. Owner access is protected and cannot be unsafe-edited from staff tools.",
      lo: "ບັນຊີພະນັກງານ, ບົດບາດ, ແລະ ກົດອະນຸມັດຢູ່ໃນ ພະນັກງານ ແລະ ຄວາມປອດໄພ. ສິດເຈົ້າຂອງຖືກປົກປ້ອງ ແລະ ບໍ່ສາມາດແກ້ໄຂບໍ່ປອດໄພຈາກເຄື່ອງມືພະນັກງານ.",
    },
    steps: {
      en: [
        "Add or deactivate staff under Staff.",
        "Adjust editable roles under Roles & Permissions.",
        "Configure when approval is required under Approval Rules.",
      ],
      lo: [
        "ເພີ່ມ ຫຼື ຢຸດໃຊ້ພະນັກງານໃນ ພະນັກງານ.",
        "ປັບບົດບາດທີ່ແກ້ໄຂໄດ້ໃນ ບົດບາດ ແລະ ສິດ.",
        "ກຳນົດເມື່ອຕ້ອງຂໍອະນຸມັດໃນ ກົດການອະນຸມັດ.",
      ],
    },
    hrefs: [
      { href: "/settings/staff", label: { en: "Staff", lo: "ພະນັກງານ" } },
      { href: "/settings/roles", label: { en: "Roles & Permissions", lo: "ບົດບາດ ແລະ ສິດ" } },
    ],
  },
  {
    id: "loyalty",
    title: { en: "Loyalty", lo: "ຄະແນນສະສົມ" },
    keywords: "loyalty points earn redeem membership ຄະແນນ ສະມາຊິກ",
    body: {
      en: "Loyalty rules control earn and redeem math for POS. Membership levels stay in the Membership module and are not configured here.",
      lo: "ກົດຄະແນນຄວບຄຸມການໄດ້ ແລະ ແລກຄະແນນໃນ POS. ລະດັບສະມາຊິກຢູ່ໃນໂມດູນສະມາຊິກ ບໍ່ໄດ້ຕັ້ງຢູ່ນີ້.",
    },
    steps: {
      en: [
        "Open Settings → Loyalty.",
        "Set spend-per-point, point value, and minimum redeem.",
        "Save after reviewing the confirmation.",
      ],
      lo: [
        "ເປີດ ຕັ້ງຄ່າ → ຄະແນນສະສົມ.",
        "ກຳນົດຍອດໃຊ້ຕໍ່ຄະແນນ, ມູນຄ່າຄະແນນ, ແລະ ຂັ້ນຕ່ຳການແລກ.",
        "ບັນທຶກຫຼັງກວດກາການຢືນຢັນ.",
      ],
    },
    hrefs: [
      { href: "/settings/loyalty", label: { en: "Loyalty settings", lo: "ຕັ້ງຄ່າຄະແນນ" } },
      { href: "/membership-levels", label: { en: "Membership module", lo: "ໂມດູນສະມາຊິກ" } },
    ],
  },
  {
    id: "customer-display",
    title: { en: "Customer Display", lo: "ຈໍລູກຄ້າ" },
    keywords: "customer display screen ads qr template monitor ຈໍລູກຄ້າ ໂຄສະນາ",
    body: {
      en: "Customer Display settings are saved on this device only. Resetting the page does not delete company logo, QR banks, or company settings.",
      lo: "ຕັ້ງຄ່າຈໍລູກຄ້າບັນທຶກໃນອຸປະກອນນີ້ເທົ່ານັ້ນ. ການຣີເຊັດໜ້ານີ້ບໍ່ລຶບໂລໂກ້ບໍລິສັດ, ທະນາຄານ QR, ຫຼື ຕັ້ງຄ່າບໍລິສັດ.",
    },
    steps: {
      en: [
        "Open Customer Display from Settings.",
        "Choose template, QR style, and local ads/media.",
        "Open the customer screen from POS when ready.",
      ],
      lo: [
        "ເປີດ ຈໍລູກຄ້າຈາກຕັ້ງຄ່າ.",
        "ເລືອກແມ່ແບບ, ຮູບແບບ QR, ແລະ ສື່ໂຄສະນາທ້ອງຖິ່ນ.",
        "ເປີດຈໍລູກຄ້າຈາກ POS ເມື່ອພ້ອມ.",
      ],
    },
    hrefs: [{ href: "/settings/customer-display", label: { en: "Customer Display settings", lo: "ຕັ້ງຄ່າຈໍລູກຄ້າ" } }],
  },
];

export function filterHelpTopics(query: string, locale: SupportedLocale) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return HELP_TOPICS;
  return HELP_TOPICS.filter((topic) =>
    [topic.title.en, topic.title.lo, topic.body.en, topic.body.lo, topic.keywords, ...topic.steps.en, ...topic.steps.lo]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  );
}
