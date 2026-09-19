"use client";

import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import { tPos as t } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

export type SaleOptionsDraft = {
  /** Reserved for future subscriber selection — STEP 2 shell only. */
  subscriberId: string | null;
  subscriberName: string | null;
  /** Reserved for future promotion notices — STEP 2 shell only. */
  promotionNote: string | null;
  /** Reserved — STEP 2 shell only; never exposes cashier-editable %. */
  discountNote: string | null;
  pointsNote: string | null;
  couponCode: string | null;
};

export const EMPTY_SALE_OPTIONS: SaleOptionsDraft = {
  subscriberId: null,
  subscriberName: null,
  promotionNote: null,
  discountNote: null,
  pointsNote: null,
  couponCode: null,
};

export function saleOptionsSummaryParts(options: SaleOptionsDraft): string[] {
  const parts: string[] = [];
  if (options.subscriberName) parts.push(options.subscriberName);
  if (options.promotionNote) parts.push(options.promotionNote);
  if (options.discountNote) parts.push(options.discountNote);
  if (options.pointsNote) parts.push(options.pointsNote);
  if (options.couponCode) parts.push(options.couponCode);
  return parts;
}

function SaleOptionsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <h3 className="text-base font-black tracking-tight">{title}</h3>
      {description ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PlaceholderState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-4 text-sm font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

export function SaleOptionsDrawer({
  billContext,
  customerName,
  draft,
  onApply,
  onCancel,
  onDraftChange,
}: {
  billContext: string;
  customerName: string;
  draft: SaleOptionsDraft;
  onApply: () => void;
  onCancel: () => void;
  onDraftChange: (next: SaleOptionsDraft) => void;
}) {
  // Keep onDraftChange wired for future editable shells without mutating totals in STEP 2.
  void onDraftChange;
  void draft;

  return (
    <PosWorkspaceModal
      footer={
        <>
          <button
            className="h-11 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:border-primary hover:text-primary"
            type="button"
            onClick={onCancel}
          >
            {t("ui.cancel")}
          </button>
          <button
            className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-105"
            type="button"
            onClick={onApply}
          >
            {t("ui.apply")}
          </button>
        </>
      }
      headerActions={
        <div className="hidden min-w-0 max-w-[18rem] text-right text-xs font-semibold text-muted-foreground sm:block">
          <div className="truncate">{t("ui.bill.label")} {billContext}</div>
          <div className="truncate">{t("ui.customer.label")} {customerName}</div>
        </div>
      }
      onClose={onCancel}
      title={t("ui.sale.options")}
    >
      <div className="grid gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{t("ui.sale.options.intro")}</p>

        {/* Future: reuse MemberSearchPanel + fetchMemberSearch (/api/pos/members/search). STEP 7. */}
        <SaleOptionsSection description={t("ui.sale.options.subscriber.hint")} title={t("ui.subscriber")}>
          <PlaceholderState>{t("ui.no.subscriber.selected")}</PlaceholderState>
          <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{t("ui.sale.options.subscriber.cashier.note")}</p>
        </SaleOptionsSection>

        <SaleOptionsSection description={t("ui.sale.options.promotions.hint")} title={t("ui.promotions")}>
          <PlaceholderState>{t("ui.no.promotions.applied")}</PlaceholderState>
          <ul className="mt-2 space-y-1 text-[11px] font-semibold text-muted-foreground">
            <li>• {t("ui.sale.options.promotions.auto")}</li>
            <li>• {t("ui.sale.options.promotions.unlock")}</li>
          </ul>
        </SaleOptionsSection>

        <SaleOptionsSection description={t("ui.sale.options.discount.hint")} title={t("ui.discount")}>
          <PlaceholderState>{t("ui.sale.options.discount.shell")}</PlaceholderState>
        </SaleOptionsSection>

        <SaleOptionsSection description={t("ui.sale.options.points.hint")} title={t("ui.points.loyalty")}>
          <PlaceholderState>{t("ui.sale.options.points.shell")}</PlaceholderState>
        </SaleOptionsSection>

        <SaleOptionsSection description={t("ui.sale.options.coupon.hint")} title={t("ui.coupon.voucher")}>
          <PlaceholderState>{t("ui.sale.options.coupon.shell")}</PlaceholderState>
        </SaleOptionsSection>
      </div>
    </PosWorkspaceModal>
  );
}

export function SaleOptionsSummaryChip({
  className,
  options,
}: {
  className?: string;
  options: SaleOptionsDraft;
}) {
  const parts = saleOptionsSummaryParts(options);
  if (parts.length === 0) return null;
  return (
    <div className={cn("rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary", className)}>
      {parts.join(" • ")}
    </div>
  );
}
