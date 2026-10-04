export const SUPPORT_TYPES = ["CHAT", "PROBLEM", "FEATURE_REQUEST"] as const;
export const SUPPORT_CATEGORIES = [
  "POS",
  "PRODUCTS",
  "INVENTORY",
  "PURCHASING",
  "CUSTOMERS",
  "MEMBERSHIP",
  "REPORTS",
  "SETTINGS",
  "PERFORMANCE",
  "PRINTING",
  "OTHER",
] as const;
export const CHAT_STATUSES = ["OPEN", "WAITING_SUPPORT", "WAITING_STORE", "RESOLVED", "CLOSED"] as const;
export const FEATURE_STATUSES = ["SUBMITTED", "REVIEWING", "PLANNED", "IN_PROGRESS", "COMPLETED", "DECLINED"] as const;

export type SupportTicketSummary = {
  category: string | null;
  companyId: string;
  companyName: string | null;
  createdAt: string;
  id: string;
  lastMessage: string;
  status: string;
  storeUnread: boolean;
  subject: string;
  type: string;
  updatedAt: string;
  userName: string | null;
};

export type SupportMessageView = {
  createdAt: string;
  id: string;
  message: string;
  senderSide: "STORE" | "SUPER_ADMIN";
};

export type SupportTicketDetail = SupportTicketSummary & {
  affectedArea: string | null;
  appVersion: string | null;
  browserSummary: string | null;
  messages: SupportMessageView[];
  sourcePath: string | null;
};
