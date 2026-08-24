import { t } from "@/lib/i18n/ui";

export type SaleStatusTone =
  | "completed"
  | "adjusted"
  | "exchanged"
  | "partial_refunded"
  | "refunded"
  | "voided"
  | "unknown";

export type SaleStatusVisual = {
  badgeClassName: string;
  indicatorClassName: string;
  isVoided: boolean;
  label: string;
  tone: SaleStatusTone;
};

const LABEL_KEY: Record<SaleStatusTone, string> = {
  adjusted: "ui.sale.status.adjusted",
  completed: "ui.sale.status.completed",
  exchanged: "ui.sale.status.exchanged",
  partial_refunded: "ui.sale.status.partial.refund",
  refunded: "ui.sale.status.refunded",
  unknown: "ui.sale.status.unknown",
  voided: "ui.sale.status.voided",
};

const VISUAL: Record<SaleStatusTone, Omit<SaleStatusVisual, "label">> = {
  completed: {
    badgeClassName: "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]",
    indicatorClassName: "bg-[#22C55E]",
    isVoided: false,
    tone: "completed",
  },
  adjusted: {
    badgeClassName: "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]",
    indicatorClassName: "bg-[#38BDF8]",
    isVoided: false,
    tone: "adjusted",
  },
  exchanged: {
    badgeClassName: "border-[#5EEAD4]/40 bg-[#5EEAD4]/10 text-[#5EEAD4]",
    indicatorClassName: "bg-[#5EEAD4]",
    isVoided: false,
    tone: "exchanged",
  },
  partial_refunded: {
    badgeClassName: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
    indicatorClassName: "bg-[#F59E0B]",
    isVoided: false,
    tone: "partial_refunded",
  },
  refunded: {
    badgeClassName: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]",
    indicatorClassName: "bg-[#EF4444]",
    isVoided: false,
    tone: "refunded",
  },
  voided: {
    badgeClassName: "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]",
    indicatorClassName: "bg-[#EF4444]",
    isVoided: true,
    tone: "voided",
  },
  unknown: {
    badgeClassName: "border-muted-foreground/30 bg-muted text-muted-foreground",
    indicatorClassName: "bg-muted-foreground/50",
    isVoided: false,
    tone: "unknown",
  },
};

const TONE_BY_STATUS: Record<string, SaleStatusTone> = {
  adjusted: "adjusted",
  cancelled: "voided",
  completed: "completed",
  exchanged: "exchanged",
  paid: "completed",
  partial_refund: "partial_refunded",
  partial_refunded: "partial_refunded",
  refunded: "refunded",
  voided: "voided",
};

export function resolveSaleStatusTone(status: string): SaleStatusTone {
  return TONE_BY_STATUS[status.trim().toLowerCase()] ?? "unknown";
}

export function resolveSaleStatusVisual(status: string): SaleStatusVisual {
  const tone = resolveSaleStatusTone(status);
  return {
    ...VISUAL[tone],
    label: t(LABEL_KEY[tone]),
  };
}
