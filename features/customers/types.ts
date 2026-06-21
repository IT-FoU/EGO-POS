export type CustomerStatus = "active" | "inactive";

export type MembershipLevelName = "Standard" | "Silver" | "Gold" | "Platinum";

export type MembershipLevel = {
  id: string;
  name: MembershipLevelName;
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
  membershipLevel: MembershipLevelName;
  creditLimitLak: number;
  openingBalanceLak: number;
  outstandingBalanceLak: number;
  totalPurchasesLak: number;
  earnedPoints: number;
  redeemedPoints: number;
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
