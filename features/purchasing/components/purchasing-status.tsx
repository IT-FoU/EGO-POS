import { cn } from "@/lib/utils";
import type {
  PayableStatus,
  PurchaseStatus,
  Supplier,
} from "@/features/purchasing/types";
import {
  payableStatusLabel,
  purchaseStatusLabel,
  supplierStatusLabel,
} from "@/lib/i18n/purchasing-copy";
import type { SupportedLocale } from "@/lib/constants";

const purchaseStyles: Record<PurchaseStatus, string> = {
  cancelled: "border-danger/40 bg-danger/10 text-danger",
  closed: "border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground",
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  ordered: "border-primary/40 bg-primary/10 text-primary",
  partial: "border-warning/40 bg-warning/10 text-warning",
  received: "border-success/40 bg-success/10 text-success",
};

const payableStyles: Record<PayableStatus, string> = {
  paid: "border-success/40 bg-success/10 text-success",
  partial: "border-warning/40 bg-warning/10 text-warning",
  unpaid: "border-danger/40 bg-danger/10 text-danger",
};

const supplierStyles: Record<Supplier["status"], string> = {
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function PurchaseStatusBadge({
  locale,
  status,
}: {
  locale?: SupportedLocale;
  status: PurchaseStatus;
}) {
  return <Badge className={purchaseStyles[status]} label={purchaseStatusLabel(status, locale)} />;
}

export function PayableStatusBadge({
  locale,
  status,
}: {
  locale?: SupportedLocale;
  status: PayableStatus;
}) {
  return <Badge className={payableStyles[status]} label={payableStatusLabel(status, locale)} />;
}

export function SupplierStatusBadge({
  locale,
  status,
}: {
  locale?: SupportedLocale;
  status: Supplier["status"];
}) {
  return <Badge className={supplierStyles[status]} label={supplierStatusLabel(status, locale)} />;
}

function Badge({ className, label }: { className: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize",
        className,
      )}
    >
      {label}
    </span>
  );
}
