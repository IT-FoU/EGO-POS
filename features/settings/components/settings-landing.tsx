"use client";

import Link from "next/link";
import {
  Banknote, Building2, CalendarOff, ChevronRight, CircleHelp, Clock3, Gift, Image,
  MapPin, MonitorPlay, Percent, QrCode, ReceiptText, Search, ShieldCheck, Users,
  UserRoundCog, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { SettingsIndexScrollRestore } from "@/features/settings/components/settings-index-scroll-restore";
import { readReceiptPrintModePreference } from "@/features/settings/receipt-print-mode";
import { captureSettingsIndexScroll } from "@/features/settings/settings-index-scroll";
import type { ReceiptPrintMode, SettingsFormData } from "@/features/settings/types";

export type SettingsLandingFacts = {
  activeQrAccounts: number;
  activeQrBanks: number;
  activeStaff: number;
  approvalRulesEnabled: number;
  hasLogo: boolean;
  settings: SettingsFormData | null;
};

type Scope = "branch" | "company" | "device";
type Localized = { en: string; lo: string };
type Row = {
  description: Localized;
  href: string;
  icon: LucideIcon;
  keywords: string;
  scope: Scope;
  summary: (facts: SettingsLandingFacts, locale: SupportedLocale, printMode: ReceiptPrintMode) => string;
  title: Localized;
};
type Group = { id: string; title: Localized; rows: Row[] };

const PREFETCH_SETTINGS_HREFS = new Set([
  "/settings/approval-rules",
  "/settings/business-logo",
  "/settings/company-profile",
  "/settings/customer-display",
  "/settings/qr-payments",
  "/settings/receipt",
  "/settings/roles",
  "/settings/staff",
]);

const text = (en: string, lo: string): Localized => ({ en, lo });
const localized = (value: Localized, locale: SupportedLocale) => value[locale];

const groups: Group[] = [
  {
    id: "business",
    title: text("Business", "ທຸລະກິດ"),
    rows: [
      { description: text("Store name and contact details", "ຊື່ຮ້ານ ແລະ ຂໍ້ມູນຕິດຕໍ່"), href: "/settings/company-profile", icon: Building2, keywords: "company profile business store contact address phone email ບໍລິສັດ ຮ້ານ", scope: "company", summary: ({ settings }) => settings?.companyName ?? "", title: text("Company Profile", "ໂປຣໄຟລ໌ບໍລິສັດ") },
      { description: text("Image on receipts and customer screen", "ຮູບພາບໃນໃບບິນ ແລະ ຈໍລູກຄ້າ"), href: "/settings/business-logo", icon: Image, keywords: "business logo image receipt customer display ໂລໂກ້ ຮູບ", scope: "company", summary: ({ hasLogo }, locale) => hasLogo ? (locale === "lo" ? "ອັບໂຫຼດແລ້ວ" : "Uploaded") : (locale === "lo" ? "ຍັງບໍ່ໄດ້ຕັ້ງ" : "Not set"), title: text("Business Logo", "ໂລໂກ້ທຸລະກິດ") },
      { description: text("Current branch name and contact details", "ຊື່ ແລະ ຂໍ້ມູນຕິດຕໍ່ຂອງສາຂາປັດຈຸບັນ"), href: "/settings/branch-information", icon: MapPin, keywords: "branch information name phone address current branch ສາຂາ", scope: "branch", summary: (_, locale) => locale === "lo" ? "ສາຂາປັດຈຸບັນ" : "Current branch", title: text("Branch Information", "ຂໍ້ມູນສາຂາ") },
      { description: text("How tax is calculated and printed", "ວິທີຄິດ ແລະ ພິມພາສີ"), href: "/settings/tax", icon: Percent, keywords: "tax vat rate inclusive receipt ພາສີ", scope: "company", summary: ({ settings }, locale) => settings?.vatEnabled ? `${locale === "lo" ? "ເປີດ" : "On"} • ${settings.vatRate}%` : (locale === "lo" ? "ປິດ" : "Off"), title: text("Tax / VAT", "ພາສີ / VAT") },
    ],
  },
  {
    id: "pos-payments",
    title: text("POS & Payments", "POS ແລະ ການຊຳລະ"),
    rows: [
      { description: text("Whether sales require an open shift", "ກຳນົດວ່າຕ້ອງເປີດກະກ່ອນຂາຍຫຼືບໍ່"), href: "/settings/cash-shift", icon: Banknote, keywords: "cash shift start work required sale ກະ ເງິນສົດ ເລີ່ມວຽກ", scope: "company", summary: ({ settings }, locale) => settings?.requireCashShiftBeforeSale ? (locale === "lo" ? "ບັງຄັບ" : "Required") : (locale === "lo" ? "ບໍ່ບັງຄັບ" : "Not required"), title: text("Cash Shift", "ກະເງິນສົດ") },
      { description: text("Receipt text and printing behavior", "ຂໍ້ຄວາມໃບບິນ ແລະ ການພິມ"), href: "/settings/receipt", icon: ReceiptText, keywords: "receipt printing print header footer prefix auto ask ໃບບິນ ພິມ", scope: "company", summary: (_, locale, mode) => printModeLabel(mode, locale), title: text("Receipt & Printing", "ໃບບິນ ແລະ ການພິມ") },
      { description: text("Banks and branch QR accounts", "ທະນາຄານ ແລະ ບັນຊີ QR ປະຈຳສາຂາ"), href: "/settings/qr-payments", icon: QrCode, keywords: "qr payments bank account branch scan ຊຳລະ ທະນາຄານ ບັນຊີ", scope: "company", summary: ({ activeQrAccounts, activeQrBanks }, locale) => locale === "lo" ? `${activeQrBanks} ທະນາຄານ • ${activeQrAccounts} ບັນຊີ` : `${activeQrBanks} bank${activeQrBanks === 1 ? "" : "s"} • ${activeQrAccounts} account${activeQrAccounts === 1 ? "" : "s"}`, title: text("QR Payments", "ການຊຳລະ QR") },
      { description: text("Screen layout and media", "ຮູບແບບຈໍ ແລະ ສື່ໂຄສະນາ"), href: "/settings/customer-display", icon: MonitorPlay, keywords: "customer display screen ads media promotion monitor ຈໍລູກຄ້າ ໂຄສະນາ", scope: "device", summary: (_, locale) => locale === "lo" ? "ສະເພາະອຸປະກອນນີ້" : "This device only", title: text("Customer Display", "ຈໍລູກຄ້າ") },
    ],
  },
  {
    id: "staff",
    title: text("Staff & Security", "ພະນັກງານ ແລະ ຄວາມປອດໄພ"),
    rows: [
      { description: text("People who can sign in", "ຜູ້ທີ່ສາມາດເຂົ້າລະບົບ"), href: "/settings/staff", icon: Users, keywords: "staff people login user employee security ພະນັກງານ ເຂົ້າລະບົບ ຄວາມປອດໄພ", scope: "company", summary: ({ activeStaff }, locale) => locale === "lo" ? `${activeStaff} ຄົນໃຊ້ງານ` : `${activeStaff} active`, title: text("Staff", "ພະນັກງານ") },
      { description: text("What each role can do", "ສິ່ງທີ່ແຕ່ລະບົດບາດເຮັດໄດ້"), href: "/settings/roles", icon: ShieldCheck, keywords: "roles permissions owner manager cashier access security ບົດບາດ ສິດ ຄວາມປອດໄພ", scope: "company", summary: (_, locale) => locale === "lo" ? "ເຈົ້າຂອງຖືກປົກປ້ອງ" : "Owner protected", title: text("Roles & Permissions", "ບົດບາດ ແລະ ສິດ") },
      { description: text("When manager approval is required", "ເມື່ອໃດຕ້ອງຂໍອະນຸມັດ"), href: "/settings/approval-rules", icon: UserRoundCog, keywords: "approval rules manager discount refund purchasing security ອະນຸມັດ ກົດ ຄວາມປອດໄພ", scope: "company", summary: ({ approvalRulesEnabled }, locale) => locale === "lo" ? `${approvalRulesEnabled} ລາຍການເປີດໃຊ້` : `${approvalRulesEnabled} enabled`, title: text("Approval Rules", "ກົດການອະນຸມັດ") },
      { description: text("Weekly day off and quota", "ວັນພັກປະຈຳອາທິດ ແລະ ໂຄຕາ"), href: "/settings/day-off", icon: CalendarOff, keywords: "day off leave holiday quota weekly ວັນພັກ ລາພັກ", scope: "company", summary: (_, locale) => locale === "lo" ? "ນະໂຍບາຍພັກພະນັກງານ" : "Staff leave policy", title: text("Day Off", "ວັນພັກ") },
      { description: text("Overtime time windows", "ຊ່ວງເວລາເຮັດວຽກລ່ວງເວລາ"), href: "/settings/ot", icon: Clock3, keywords: "ot overtime time window ລ່ວງເວລາ", scope: "company", summary: (_, locale) => locale === "lo" ? "ຊ່ວງເວລາ OT" : "OT time windows", title: text("OT", "OT") },
    ],
  },
  {
    id: "customers",
    title: text("Customers", "ລູກຄ້າ"),
    rows: [
      { description: text("How points are earned and redeemed", "ວິທີໄດ້ ແລະ ແລກຄະແນນ"), href: "/settings/loyalty", icon: Gift, keywords: "loyalty points earn redeem customer ຄະແນນ ລູກຄ້າ", scope: "company", summary: ({ settings }, locale) => settings?.loyaltyEnabled ? (locale === "lo" ? "ເປີດ" : "On") : (locale === "lo" ? "ປິດ" : "Off"), title: text("Loyalty", "ຄະແນນສະສົມ") },
    ],
  },
  {
    id: "help",
    title: text("Help & Support", "ຊ່ວຍເຫຼືອ ແລະ ສະໜັບສະໜູນ"),
    rows: [
      { description: text("Help topics and system information", "ຫົວຂໍ້ຊ່ວຍເຫຼືອ ແລະ ຂໍ້ມູນລະບົບ"), href: "/settings/help", icon: CircleHelp, keywords: "help support about version system information ຊ່ວຍເຫຼືອ ສະໜັບສະໜູນ ເວີຊັນ", scope: "company", summary: (_, locale) => locale === "lo" ? "ຊ່ວຍເຫຼືອ ແລະ ຂໍ້ມູນ" : "Help and About", title: text("Help & Support", "ຊ່ວຍເຫຼືອ ແລະ ສະໜັບສະໜູນ") },
    ],
  },
];

const searchExtras = [
  { description: text("Membership stays in its own module.", "ສະມາຊິກຢູ່ໃນໂມດູນສະມາຊິກ."), href: "/membership-levels", keywords: "membership member tier ສະມາຊິກ", title: text("Membership", "ສະມາຊິກ") },
  { description: text("Open the existing inventory reorder page.", "ເປີດໜ້າສັ່ງສິນຄ້າຄືນທີ່ມີຢູ່."), href: "/reports/inventory/reorder", keywords: "reorder inventory stock ສັ່ງຊື້ຄືນ ສິນຄ້າ", title: text("Reorder", "ສັ່ງຊື້ຄືນ") },
  { description: text("Open Store Activity Logs outside Settings.", "ເປີດບັນທຶກກິດຈະກຳຮ້ານນອກຕັ້ງຄ່າ."), href: "/activity-logs", keywords: "activity audit log history ກິດຈະກຳ ກວດສອບ", title: text("Store Activity Logs", "ບັນທຶກກິດຈະກຳຮ້ານ") },
] as const;

const explanations = [
  { description: text("Use the LO / EN control in the page header.", "ໃຊ້ປຸ່ມ LO / EN ຢູ່ສ່ວນຫົວໜ້າ."), keywords: "language lao english en lo ພາສາ ລາວ ອັງກິດ", title: text("Language", "ພາສາ") },
  { description: text("POS currently uses LAK; currency and decimals are not editable here.", "POS ໃຊ້ LAK ໃນປັດຈຸບັນ; ບໍ່ສາມາດປ່ຽນສະກຸນເງິນ ຫຼື ທົດສະນິຍົມຢູ່ນີ້."), keywords: "currency lak decimal rounding ສະກຸນເງິນ ທົດສະນິຍົມ", title: text("Currency", "ສະກຸນເງິນ") },
  { description: text("Alerts remain active; no category toggle exists.", "ການແຈ້ງເຕືອນຍັງເຮັດວຽກ; ຍັງບໍ່ມີປຸ່ມປິດເປີດຕາມປະເພດ."), keywords: "notification alerts low stock ແຈ້ງເຕືອນ ສິນຄ້າໃກ້ໝົດ", title: text("Notifications", "ການແຈ້ງເຕືອນ") },
  { description: text("Support ticket submission is not available yet.", "ຍັງບໍ່ສາມາດສົ່ງບັດສະໜັບສະໜູນໄດ້ເທື່ອ."), keywords: "problem bug feedback feature request ticket support ບັນຫາ ບັກ ຄຳຕິຊົມ ຄຳຂໍຟີເຈີ", title: text("Support tickets", "ບັດສະໜັບສະໜູນ") },
  { description: text("This is not a configurable setting in this release.", "ລາຍການນີ້ຍັງບໍ່ແມ່ນການຕັ້ງຄ່າໃນລຸ້ນນີ້."), keywords: "hours business hours holiday printer payroll terminal session timeout pin ເວລາເປີດຮ້ານ ວັນພັກ ເຄື່ອງພິມ ເງິນເດືອນ", title: text("Not available in this release", "ຍັງບໍ່ມີໃນລຸ້ນນີ້") },
] as const;

function printModeLabel(mode: ReceiptPrintMode, locale: SupportedLocale) {
  if (mode === "auto_print") return locale === "lo" ? "ພິມອັດຕະໂນມັດ" : "Auto print";
  if (mode === "no_auto_print") return locale === "lo" ? "ບໍ່ພິມອັດຕະໂນມັດ" : "No auto print";
  return locale === "lo" ? "ຖາມທຸກຄັ້ງ" : "Ask every time";
}

function matches(query: string, values: string[]) {
  return values.join(" ").toLocaleLowerCase().includes(query);
}

export function SettingsLanding({ allowedHrefs, facts, locale: initialLocale }: { allowedHrefs: readonly string[]; facts: SettingsLandingFacts; locale: SupportedLocale }) {
  const locale = useAppLocale(initialLocale);
  const [query, setQuery] = useState("");
  const [printMode, setPrintMode] = useState<ReceiptPrintMode>("ask_every_time");
  useEffect(() => setPrintMode(readReceiptPrintModePreference()), []);
  const needle = query.trim().toLocaleLowerCase();
  const allowed = useMemo(() => new Set(allowedHrefs), [allowedHrefs]);
  const filtered = useMemo(() => groups.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => allowed.has(row.href) && (!needle || matches(needle, [group.title.en, group.title.lo, row.title.en, row.title.lo, row.description.en, row.description.lo, row.keywords]))),
  })).filter((group) => group.rows.length > 0), [allowed, needle]);
  const extraResults = needle ? searchExtras.filter((item) => allowed.has(item.href) && matches(needle, [item.title.en, item.title.lo, item.description.en, item.description.lo, item.keywords])) : [];
  const explanationResults = needle ? explanations.filter((item) => matches(needle, [item.title.en, item.title.lo, item.description.en, item.description.lo, item.keywords])) : [];
  const hasResults = filtered.length + extraResults.length + explanationResults.length > 0;

  return (
    <div className="grid gap-6" data-settings-landing>
      <SettingsIndexScrollRestore />
      <div>
        <h1 className="text-3xl font-semibold">{locale === "lo" ? "ຕັ້ງຄ່າ" : "Settings"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{locale === "lo" ? "ເລືອກຫົວຂໍ້ເພື່ອເປີດໜ້າລາຍລະອຽດ." : "Choose an item to open its detail page."}</p>
      </div>
      <label className="grid gap-2 text-sm font-medium" htmlFor="settings-search">
        <span>{locale === "lo" ? "ຄົ້ນຫາຕັ້ງຄ່າ" : "Search settings"}</span>
        <span className="relative block">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input aria-label={locale === "lo" ? "ຄົ້ນຫາຕັ້ງຄ່າ" : "Search settings"} className="field-input pl-11" id="settings-search" placeholder={locale === "lo" ? "QR, ພາສີ, ພະນັກງານ..." : "QR, tax, staff, logo..."} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </span>
      </label>
      {filtered.map((group) => (
        <section className="overflow-hidden rounded-lg border border-border bg-card" data-settings-category={group.id} key={group.id}>
          <h2 className="border-b border-border px-4 py-3 text-lg font-semibold sm:px-5 sm:py-4">{localized(group.title, locale)}</h2>
          <div className="divide-y divide-border">
            {group.rows.map((row) => {
              const Icon = row.icon;
              return (
                <Link className="settings-motion-row group flex min-w-0 cursor-pointer items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4 sm:px-5" data-settings-row={row.href} href={row.href} key={row.href} onClick={() => captureSettingsIndexScroll(row.href)} prefetch={PREFETCH_SETTINGS_HREFS.has(row.href) ? true : undefined}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-semibold">{localized(row.title, locale)}</span>
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">{row.scope === "device" ? (locale === "lo" ? "ອຸປະກອນນີ້" : "This device") : row.scope === "branch" ? (locale === "lo" ? "ສາຂາ" : "Branch") : (locale === "lo" ? "ບໍລິສັດ" : "Company")}</span>
                    </span>
                    <span className="text-sm leading-5 text-muted-foreground">{localized(row.description, locale)}</span>
                    <span className="text-sm font-medium text-foreground">{row.summary(facts, locale, printMode)}</span>
                  </span>
                  <ChevronRight className="settings-motion-chevron size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {extraResults.length || explanationResults.length ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={locale === "lo" ? "ຜົນຄົ້ນຫາອື່ນ" : "Other search results"}>
          <h2 className="border-b border-border px-5 py-4 text-lg font-semibold">{locale === "lo" ? "ຜົນຄົ້ນຫາອື່ນ" : "Other results"}</h2>
          <div className="divide-y divide-border">
            {extraResults.map((item) => (
              <Link className="settings-motion-row flex cursor-pointer items-center gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" href={item.href} key={item.href}>
                <span className="min-w-0 flex-1"><span className="font-semibold">{localized(item.title, locale)}</span><span className="mt-1 block text-sm text-muted-foreground">{localized(item.description, locale)}</span></span>
                <ChevronRight className="settings-motion-chevron size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            {explanationResults.map((item) => (
              <div className="px-5 py-4" data-settings-explanation key={item.title.en}>
                <div className="font-semibold">{localized(item.title, locale)}</div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{localized(item.description, locale)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {!hasResults ? <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{locale === "lo" ? "ບໍ່ພົບຜົນຄົ້ນຫາ" : "No matching settings"}</div> : null}
    </div>
  );
}
