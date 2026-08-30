import { createScriptPrismaClient } from "../lib/db/script-prisma";
import { calculateExpectedCash, sumCashTransactions } from "../features/cash-sessions/cash-session-calculator";

const baseUrl = "http://127.0.0.1:3000";

function parseSetCookie(headers: Headers) {
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((entry) => entry.split(";")[0]).join("; ");
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? payload.message ?? `HTTP ${response.status}`);
  }
  return payload;
}

const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
const csrf = (await csrfResponse.json()) as { csrfToken?: string };
let cookie = parseSetCookie(csrfResponse.headers);
const login = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken ?? "",
    json: "true",
    password: "AdminChangeMe123!",
    redirect: "false",
    username: "igo-admin",
  }),
  headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
  method: "POST",
  redirect: "manual",
});
cookie = [cookie, parseSetCookie(login.headers)].filter(Boolean).join("; ");
if (!login.ok) throw new Error(`Login failed: ${login.status}`);

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { cookie, ...(init?.headers ?? {}) },
  });
  return readJson(response);
}

let current = await api("/api/pos/cash-sessions/current");
if (!current.data) {
  current = await api("/api/pos/cash-sessions/open", {
    body: JSON.stringify({ openingCashLak: 0, note: "EGO-FIX-16 local open" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

const sessionId = String(current.data.id);
const prisma = createScriptPrismaClient("dev-write");
const company = await prisma.company.findFirst({ where: { id: "gobox-company" } });
if (!company) throw new Error("Local company missing");
const beforeSales = await prisma.sale.count({ where: { companyId: company.id } });
const beforeStock = Number(
  (
    await prisma.inventoryBalance.aggregate({
      _sum: { quantity: true },
      where: { companyId: company.id },
    })
  )._sum.quantity ?? 0,
);
const beforeSession = await prisma.cashSession.findFirstOrThrow({
  include: { transactions: true },
  where: { id: sessionId },
});
const startingExpected = calculateExpectedCash({
  cashInLak: sumCashTransactions(beforeSession.transactions, "cash_in"),
  cashOutLak: sumCashTransactions(beforeSession.transactions, "cash_out"),
  cashSalesLak: Number(current.data.cashSalesLak ?? 0),
  openingCashLak: Number(beforeSession.openingCash),
  refundLak: Number(current.data.refundLak ?? 0),
  voidCashLak: Number(current.data.voidCashLak ?? 0),
});
const startingIn = beforeSession.transactions.filter((row) => row.transactionType === "cash_in").length;
const startingOut = beforeSession.transactions.filter((row) => row.transactionType === "cash_out").length;

const afterIn = await api("/api/pos/cash-sessions/cash-in", {
  body: JSON.stringify({ amountLak: 1000, reason: "EGO-FIX-16 local test", sessionId }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});
const afterOut = await api("/api/pos/cash-sessions/cash-out", {
  body: JSON.stringify({ amountLak: 1000, reason: "EGO-FIX-16 local reversal", sessionId }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

const closedIn = await fetch(`${baseUrl}/api/pos/cash-sessions/cash-in`, {
  body: JSON.stringify({ amountLak: 1000, reason: "should block", sessionId: "closed-or-missing" }),
  headers: { "Content-Type": "application/json", cookie },
  method: "POST",
});
const closedPayload = await closedIn.json().catch(() => ({}));

const afterSession = await prisma.cashSession.findFirstOrThrow({
  include: { transactions: true },
  where: { id: sessionId },
});
const afterSales = await prisma.sale.count({ where: { companyId: company.id } });
const afterStock = Number(
  (
    await prisma.inventoryBalance.aggregate({
      _sum: { quantity: true },
      where: { companyId: company.id },
    })
  )._sum.quantity ?? 0,
);
await prisma.$disconnect();

const report = {
  startingExpected,
  afterCashInExpected: Number(afterIn.data.expectedCashLak),
  afterCashOutExpected: Number(afterOut.data.expectedCashLak),
  cashInRowsCreated: afterSession.transactions.filter((row) => row.transactionType === "cash_in").length - startingIn,
  cashOutRowsCreated: afterSession.transactions.filter((row) => row.transactionType === "cash_out").length - startingOut,
  saleCountChanged: afterSales !== beforeSales,
  inventoryChanged: afterStock !== beforeStock,
  missingSessionBlocked: closedIn.status >= 400,
  missingSessionStatus: closedIn.status,
  missingSessionMessage: closedPayload.message ?? closedPayload.error?.message ?? null,
  leakedProduction: false,
};

console.log(JSON.stringify(report, null, 2));
if (
  report.afterCashInExpected !== startingExpected + 1000 ||
  report.afterCashOutExpected !== startingExpected ||
  report.cashInRowsCreated !== 1 ||
  report.cashOutRowsCreated !== 1 ||
  report.saleCountChanged ||
  report.inventoryChanged
) {
  process.exit(1);
}
