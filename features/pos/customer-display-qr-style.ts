export const CUSTOMER_DISPLAY_QR_STYLES = [
  "green-clean",
  "blue-wave",
  "orange-modern",
  "black-gold",
  "purple-soft",
  "teal-gradient",
] as const;

export type CustomerDisplayQrStyle = (typeof CUSTOMER_DISPLAY_QR_STYLES)[number];

export const DEFAULT_CUSTOMER_DISPLAY_QR_STYLE: CustomerDisplayQrStyle = "green-clean";

export const CUSTOMER_DISPLAY_QR_STYLE_OPTIONS: Array<{
  id: CustomerDisplayQrStyle;
  labelKey: string;
  name: string;
}> = [
  { id: "green-clean", labelKey: "ui.green.clean", name: "Green Clean" },
  { id: "blue-wave", labelKey: "ui.blue.wave", name: "Blue Wave" },
  { id: "orange-modern", labelKey: "ui.orange.modern", name: "Orange Modern" },
  { id: "black-gold", labelKey: "ui.black.gold", name: "Black Gold" },
  { id: "purple-soft", labelKey: "ui.purple.soft", name: "Purple Soft" },
  { id: "teal-gradient", labelKey: "ui.teal.gradient", name: "Teal Gradient" },
];

export type CustomerDisplayQrStyleTokens = {
  background: string;
  border: string;
  panel: string;
  primary: string;
  secondaryText: string;
  text: string;
};

export function isCustomerDisplayQrStyle(value: unknown): value is CustomerDisplayQrStyle {
  return CUSTOMER_DISPLAY_QR_STYLES.some((style) => style === value);
}

export function parseCustomerDisplayQrStyle(value: unknown): CustomerDisplayQrStyle {
  return isCustomerDisplayQrStyle(value) ? value : DEFAULT_CUSTOMER_DISPLAY_QR_STYLE;
}

export function customerDisplayQrStyleTokens(style: CustomerDisplayQrStyle): CustomerDisplayQrStyleTokens {
  switch (style) {
    case "blue-wave":
      return { background: "#DBEAFE", border: "#1D4ED8", panel: "#FFFFFF", primary: "#1D4ED8", secondaryText: "#1E3A8A", text: "#111827" };
    case "orange-modern":
      return { background: "#FFEDD5", border: "#C2410C", panel: "#FFFFFF", primary: "#EA580C", secondaryText: "#7C2D12", text: "#111827" };
    case "black-gold":
      return { background: "#111827", border: "#FBBF24", panel: "#1F2937", primary: "#FBBF24", secondaryText: "#FDE68A", text: "#F8FAFC" };
    case "purple-soft":
      return { background: "#EDE9FE", border: "#6D28D9", panel: "#FFFFFF", primary: "#6D28D9", secondaryText: "#5B21B6", text: "#111827" };
    case "teal-gradient":
      return { background: "#0F766E", border: "#99F6E4", panel: "#115E59", primary: "#99F6E4", secondaryText: "#CCFBF1", text: "#F0FDFA" };
    case "green-clean":
    default:
      return { background: "#DCFCE7", border: "#15803D", panel: "#FFFFFF", primary: "#15803D", secondaryText: "#14532D", text: "#111827" };
  }
}
