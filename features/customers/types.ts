export type CustomerStatus = "active" | "inactive";

export type KnownMembershipLevelName = "Standard" | "Silver" | "Gold" | "Platinum";
export type MembershipLevelName = string;

export type MembershipLevel = {
  id: string;
  name: string;
  minSpendLak: number;
  discountPercent: number;
};

export type Customer = {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  birthday: string;
  membershipLevel: string | null;
  creditLimitLak: number;
  openingBalanceLak: number;
  outstandingBalanceLak: number;
  totalPurchasesLak: number;
  earnedPoints: number;
  redeemedPoints: number;
  pointsBalance?: number;
  status: CustomerStatus;
  notes: string;
};

export type CustomerPurchase = {
  id: string;
  customerId: string;
  saleNo: string;
  saleDate: string;
  paymentType: "cash" | "qr" | "mixed" | "credit";
  totalLak: number;
  pointsEarned: number;
};

export type CustomerPayment = {
  id: string;
  customerId: string;
  paymentNo: string;
  paymentDate: string;
  method: "cash" | "qr" | "bank";
  amountLak: number;
  note: string;
};
