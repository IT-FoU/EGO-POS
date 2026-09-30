"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import type { BusinessPlanHeaderStatus } from "@/features/business-plan/entitlement";
import { formatRemainingDayLabel } from "@/features/business-plan/entitlement";
import { formatBusinessDateLabel } from "@/lib/datetime/business-timezone";
import type { SupportedLocale } from "@/lib/constants";

const copy = {
  en: {
    actions: "Actions",
    autoRenew: "Auto-renew",
    billingCycle: "Billing cycle",
    branches: "Branches",
    cashiers: "Cashiers",
    changePlan: "Upgrade / Change Plan",
    close: "Close plan details",
    comingLater: "Coming later",
    currentPlan: "Current plan",
    customLogo: "Custom logo",
    expiryBehavior: "Expiry behavior",
    extraDays: "Extra days",
    gracePeriod: "Grace period",
    monthly: "Monthly",
    no: "No",
    off: "Off",
    on: "On",
    planDetails: "Plan details",
    planDuration: "Plan duration",
    products: "Products",
    promotions: "Promotions",
    registered: "Registered date",
    remaining: "Remaining days",
    renew: "Renew",
    reports: "Reports",
    start: "Start date",
    status: "Status",
    subscriptionDetails: "Subscription details",
    validThrough: "Valid through",
    viewPlans: "View Plans",
    watermark: "Remove watermark",
    yearly: "Yearly",
    yes: "Yes",
    statusLabel: {
      active: "Active",
      cancelled: "Cancelled",
      expired: "Expired",
      fallback_free: "Fallback to Free Plan",
      grace: "Grace period",
    },
    behaviorLabel: {
      BLOCK_ACCESS: "Block access",
      FALLBACK_TO_FREE: "Fallback to Free Plan",
    },
  },
  lo: {
    actions: "ການດຳເນີນການ",
    autoRenew: "ຕໍ່ອັດຕະໂນມັດ",
    billingCycle: "ຮອບບິນ",
    branches: "ສາຂາ",
    cashiers: "ແຄັດເຊຍ",
    changePlan: "Upgrade / Change Plan",
    close: "ປິດລາຍລະອຽດແພັກເກດ",
    comingLater: "Coming later",
    currentPlan: "ແພັກເກດປັດຈຸບັນ",
    customLogo: "ໂລໂກ້ຂອງຮ້ານ",
    expiryBehavior: "ເມື່ອໝົດອາຍຸ",
    extraDays: "ວັນເພີ່ມ",
    gracePeriod: "ໄລຍະຜ່ອນຜັນ",
    monthly: "ລາຍເດືອນ",
    no: "ບໍ່",
    off: "ປິດ",
    on: "ເປີດ",
    planDetails: "ລາຍລະອຽດແພັກເກດ",
    planDuration: "ໄລຍະແພັກເກດ",
    products: "ສິນຄ້າ",
    promotions: "ໂປຣໂມຊັນ",
    registered: "ວັນທີລົງທະບຽນ",
    remaining: "ວັນທີ່ເຫຼືອ",
    renew: "Renew",
    reports: "ລາຍງານ",
    start: "ວັນທີເລີ່ມ",
    status: "ສະຖານະ",
    subscriptionDetails: "ລາຍລະອຽດການໃຊ້ງານ",
    validThrough: "ໃຊ້ໄດ້ຮອດ",
    viewPlans: "View Plans",
    watermark: "ເອົາລາຍນ້ຳອອກ",
    yearly: "ລາຍປີ",
    yes: "ແມ່ນ",
    statusLabel: {
      active: "ໃຊ້ງານ",
      cancelled: "ຍົກເລີກ",
      expired: "ໝົດອາຍຸ",
      fallback_free: "ກັບໄປແພັກເກດຟຣີ",
      grace: "ໄລຍະຜ່ອນຜັນ",
    },
    behaviorLabel: {
      BLOCK_ACCESS: "Block access",
      FALLBACK_TO_FREE: "Fallback to Free Plan",
    },
  },
} as const;

function limitValue(value: number | null) {
  return value === null ? null : String(value);
}

export function PlanStatusControl({
  locale,
  status,
}: {
  locale: SupportedLocale;
  status: BusinessPlanHeaderStatus;
}) {
  const [open, setOpen] = useState(false);
  const text = copy[locale];
  const dayLabel = formatRemainingDayLabel(status.remainingDays);
  const limits = [
    [text.cashiers, limitValue(status.limits.maxCashiers)],
    [text.branches, limitValue(status.limits.maxBranches)],
    [text.products, limitValue(status.limits.maxProducts)],
    [text.reports, limitValue(status.limits.maxReports)],
    [text.promotions, limitValue(status.limits.maxPromotions)],
  ].filter((row): row is [string, string] => row[1] !== null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${status.displayPlanName} ${dayLabel}`}
        className="inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1 py-0.5 text-base font-semibold text-foreground transition hover:bg-background"
        data-testid="business-plan-status"
        type="button"
        onClick={() => setOpen(true)}
      >
        <span>{status.displayPlanName}</span>
        <Clock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="tabular-nums text-muted-foreground">{dayLabel}</span>
      </button>
      {open ? (
        <div
          className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"
          data-testid="business-plan-drawer"
          onClick={() => setOpen(false)}
        >
          <section
            aria-label={text.currentPlan}
            aria-modal="true"
            className="flex h-full w-full max-w-none flex-col overflow-x-hidden border-l border-border bg-card text-foreground shadow-2xl"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-20 border-b border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">{text.currentPlan}</p>
                  <h2 className="mt-1 text-2xl font-semibold">{status.displayPlanName}</h2>
                </div>
                <button
                  aria-label={text.close}
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:text-foreground"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-5">
              <DetailSection
                rows={[
                  [text.status, text.statusLabel[status.effectiveStatus]],
                  [text.remaining, dayLabel],
                ]}
                title={text.currentPlan}
              />
              <DetailSection
                rows={[
                  [text.registered, formatBusinessDateLabel(status.registeredAt)],
                  [text.start, formatBusinessDateLabel(status.startDate)],
                  [text.validThrough, `${formatBusinessDateLabel(status.expiresAt)} 23:59`],
                  [text.planDuration, formatRemainingDayLabel(status.durationDays)],
                  ...(status.extraDays > 0 ? [[text.extraDays, formatRemainingDayLabel(status.extraDays)] as [string, string]] : []),
                  ...(status.billingCycle
                    ? [[text.billingCycle, status.billingCycle === "yearly" ? text.yearly : text.monthly] as [string, string]]
                    : []),
                  ...(status.gracePeriodDays > 0
                    ? [[text.gracePeriod, formatRemainingDayLabel(status.gracePeriodDays)] as [string, string]]
                    : []),
                  [text.expiryBehavior, text.behaviorLabel[status.expiryBehavior]],
                  ...(status.autoRenew || status.autoRenewAvailable
                    ? [[text.autoRenew, status.autoRenew ? text.on : text.off] as [string, string]]
                    : []),
                ]}
                title={text.subscriptionDetails}
              />
              <DetailSection
                rows={[
                  ...limits,
                  [text.customLogo, status.limits.customLogo ? text.yes : text.no],
                  [text.watermark, status.limits.removeWatermark ? text.yes : text.no],
                ]}
                title={text.planDetails}
              />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">{text.actions}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <LaterButton label={text.viewPlans} />
                  <LaterButton label={text.renew} />
                  <LaterButton label={text.changePlan} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{text.comingLater}</p>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function DetailSection({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-3 last:border-b-0" key={label}>
            <div className="min-w-0 text-sm text-muted-foreground">{label}</div>
            <div className="shrink-0 text-right text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LaterButton({ label }: { label: string }) {
  return (
    <button
      aria-disabled="true"
      className="inline-flex h-10 cursor-not-allowed items-center rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground"
      disabled
      type="button"
    >
      {label}
    </button>
  );
}
