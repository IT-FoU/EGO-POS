/**
 * Payment extension points for business-account billing.
 * No gateway, QR image, card charge, or invoice posting is implemented here.
 */

export const FUTURE_PAYMENT_METHODS = ["static_qr", "dynamic_qr", "bank_transfer", "card"] as const;

export type FuturePaymentMethod = (typeof FUTURE_PAYMENT_METHODS)[number];

export type PaymentReviewStatus = "approved" | "cancelled" | "draft" | "rejected" | "submitted";

export type BusinessPaymentRecordDraft = {
  amount: number;
  companyId: string;
  currency: "LAK" | "THB" | "USD";
  metadata?: Record<string, string | number | boolean | null>;
  paymentMethod: FuturePaymentMethod;
  paymentReference?: string | null;
  planId?: string | null;
  submittedAt?: string | null;
  subscriptionId?: string | null;
};

export type PaymentApprovalDecision = {
  reviewedAt: string;
  reviewedById: string;
  status: "approved" | "rejected";
};

/**
 * Manual QR and bank transfer stay pending until a Super Admin approves them.
 * Card confirmation would call this later with status "approved". Neither path charges a card today.
 */
export type PaymentReviewPort = {
  recordSubmission: (draft: BusinessPaymentRecordDraft) => Promise<{ id: string; status: PaymentReviewStatus }>;
  review: (recordId: string, decision: PaymentApprovalDecision) => Promise<{ status: PaymentReviewStatus }>;
};

export const paymentGatewayPorts = {
  card: "not_integrated",
  dynamicQr: "not_integrated",
} as const;
