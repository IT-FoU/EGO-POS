import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED,
  formatPlanDisplayName,
  formatRemainingDayLabel,
  resolveBusinessEntitlement,
} from "../features/business-plan/entitlement";
import { parseBusinessDate } from "../lib/datetime/business-timezone";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function filesUnder(relativeDir: string): string[] {
  const root = resolve(process.cwd(), relativeDir);
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = join(directory, entry);
      if (statSync(fullPath).isDirectory()) visit(fullPath);
      else if (/\.(ts|tsx)$/.test(entry)) found.push(fullPath);
    }
  };
  visit(root);
  return found;
}

const registered = parseBusinessDate("2026-09-30");
assert(registered, "registration date parses");

const fresh = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  now: registered,
  planName: "Free",
});
assert(fresh.displayPlanName === "Free Plan", `case 1 name: ${fresh.displayPlanName}`);
assert(fresh.remainingDays === 30, `case 1 remaining: ${fresh.remainingDays}`);
assert(fresh.effectiveStatus === "active", `case 1 status: ${fresh.effectiveStatus}`);
assert(fresh.elapsedDays === 0, "case 1 has not consumed a day");
assert(formatRemainingDayLabel(fresh.remainingDays) === "30 days", "case 1 label");
console.log("PASS: case 1 new account counts 30 days from registration");

const finalEvening = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  now: new Date("2026-10-29T16:59:00.000Z"),
  planName: "Free",
});
assert(finalEvening.remainingDays === 1, `case 2 remaining: ${finalEvening.remainingDays}`);
assert(finalEvening.effectiveStatus === "active", `case 2 status: ${finalEvening.effectiveStatus}`);
assert(finalEvening.accessBlocked === false, "case 2 does not block on the final evening");
console.log("PASS: case 2 final day stays valid at 23:59 Asia/Vientiane");

const expiredMorning = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  now: new Date("2026-10-29T17:00:00.000Z"),
  planName: "Free",
});
assert(expiredMorning.remainingDays === 0, `case 3 remaining: ${expiredMorning.remainingDays}`);
assert(expiredMorning.effectiveStatus === "expired", `case 3 status: ${expiredMorning.effectiveStatus}`);
assert(expiredMorning.accessBlocked === false, "case 3 expiry does not block while enforcement is off");
console.log("PASS: case 3 expires after the final valid day");

const usedAnchor = parseBusinessDate("2026-09-15");
const fifteenDaysLater = parseBusinessDate("2026-09-30");
assert(usedAnchor && fifteenDaysLater, "duration-change dates parse");
const beforeChange = resolveBusinessEntitlement({
  companyCreatedAt: usedAnchor,
  durationDays: 30,
  now: fifteenDaysLater,
  planName: "Free",
});
const afterChange = resolveBusinessEntitlement({
  companyCreatedAt: usedAnchor,
  durationDays: 60,
  now: fifteenDaysLater,
  planName: "Free",
  storedEndDate: usedAnchor,
});
assert(beforeChange.remainingDays === 15, `case 4 before: ${beforeChange.remainingDays}`);
assert(afterChange.remainingDays === 45, `case 4 after: ${afterChange.remainingDays}`);
assert(afterChange.remainingDays !== 60, "case 4 does not restart at 60");
assert(afterChange.registeredAt.getTime() === usedAnchor.getTime(), "case 4 keeps the registration date");
assert(afterChange.anchorAt.getTime() === usedAnchor.getTime(), "case 4 keeps the countdown anchor");
console.log("PASS: case 4 duration 30 to 60 leaves 45 days from the original registration");

const extended = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  extraDays: 15,
  now: registered,
  planName: "Free",
});
assert(extended.effectiveDays === 45, `case 5 entitlement: ${extended.effectiveDays}`);
assert(extended.remainingDays === 45, `case 5 remaining: ${extended.remainingDays}`);
assert(extended.registeredAt.getTime() === registered.getTime(), "case 5 keeps registration");
console.log("PASS: case 5 extra 15 days makes a 45 day entitlement");

const blockedConfig = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  enforceAccessBlock: false,
  expiryBehavior: "BLOCK_ACCESS",
  gracePeriodDays: 0,
  now: new Date("2026-10-29T17:00:00.000Z"),
  planName: "Free",
});
const blockedEnforced = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  enforceAccessBlock: true,
  expiryBehavior: "BLOCK_ACCESS",
  gracePeriodDays: 0,
  now: new Date("2026-10-29T17:00:00.000Z"),
  planName: "Free",
});
assert(blockedConfig.expiryBehavior === "BLOCK_ACCESS", "case 6 stores BLOCK_ACCESS");
assert(blockedConfig.accessBlocked === false, "case 6 does not block when enforcement is off");
assert(blockedEnforced.accessBlocked === true, "case 6 can block only when a fixture enables it");
assert(BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED === false, "store enforcement flag stays off");
console.log("PASS: case 6 BLOCK_ACCESS is representable and stays off for POS");

const fallback = resolveBusinessEntitlement({
  billingCycle: "monthly",
  companyCreatedAt: registered,
  durationDays: 30,
  expiryBehavior: "FALLBACK_TO_FREE",
  now: new Date("2026-10-29T17:00:00.000Z"),
  planName: "Pro",
});
assert(fallback.expiryBehavior === "FALLBACK_TO_FREE", "case 7 stores FALLBACK_TO_FREE");
assert(fallback.effectiveStatus === "fallback_free", `case 7 status: ${fallback.effectiveStatus}`);
assert(fallback.accessBlocked === false, "case 7 does not block");
assert(formatPlanDisplayName("Pro") === "Pro Plan", "Pro label");
assert(formatPlanDisplayName("Business") === "Business Plan", "Business label");
console.log("PASS: case 7 FALLBACK_TO_FREE is representable");

const inGrace = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  expiryBehavior: "BLOCK_ACCESS",
  gracePeriodDays: 3,
  now: parseBusinessDate("2026-10-30") ?? registered,
  planName: "Free",
});
const afterGrace = resolveBusinessEntitlement({
  companyCreatedAt: registered,
  durationDays: 30,
  enforceAccessBlock: true,
  expiryBehavior: "BLOCK_ACCESS",
  gracePeriodDays: 3,
  now: parseBusinessDate("2026-11-02") ?? registered,
  planName: "Free",
});
assert(inGrace.effectiveStatus === "grace", `grace status: ${inGrace.effectiveStatus}`);
assert(inGrace.accessBlocked === false, "grace does not block");
assert(afterGrace.effectiveStatus === "expired", `after grace status: ${afterGrace.effectiveStatus}`);
assert(afterGrace.accessBlocked === true, "after grace, BLOCK_ACCESS can block only when enforced");
console.log("PASS: grace period sits between expiry and block/fallback");

const shell = read("components/layout/dashboard-shell.tsx");
const control = read("features/business-plan/components/plan-status-control.tsx");
const loader = read("features/business-plan/load-business-plan-status.ts");
const admin = read("features/business-plan/plan-admin.ts");
const layout = read("app/(dashboard)/layout.tsx");
const migration = read("prisma/migrations/20260930120000_business_plan_entitlement/migration.sql");
const schema = read("prisma/schema.prisma");
const paymentPort = read("features/business-plan/payment-port.ts");

assert(control.includes('data-testid="business-plan-status"'), "header status hook");
assert(control.includes("<Clock"), "header uses a clock icon");
assert(control.includes("formatRemainingDayLabel"), "header day text comes from the domain");
assert(!control.includes("setInterval"), "header does not poll");
assert(!control.includes("animate-spin"), "header has no spinner animation");
assert(!control.includes("conic-gradient") && !control.includes("stroke-dasharray"), "no circular progress");
assert(control.includes('data-testid="business-plan-drawer"'), "drawer hook");
assert(control.includes("lg:left-72"), "drawer keeps the sidebar offset");
assert(control.includes("bg-card") && control.includes("text-foreground") && control.includes("border-border"), "drawer uses theme tokens");
assert(!control.includes("bg-white") && !control.includes("text-black"), "drawer does not hardcode light colors");
assert(control.includes("disabled"), "plan actions are disabled");
assert(control.includes("Coming later"), "missing billing actions stay unfinished");
assert(!control.includes("<input") && !control.includes("<textarea"), "POS drawer has no admin editors");
assert(!control.includes("plan-admin"), "POS drawer cannot call plan admin");
assert(!/setPlanName\("Free Plan"\)|daysLeft/.test(shell), "header no longer hardcodes the plan countdown");
assert(shell.includes("PlanStatusControl"), "shell renders the plan control");
assert(layout.includes("loadBusinessPlanStatus(session.user.activeCompanyId)"), "layout reuses the session company");
assert(!layout.includes("redirect") || !layout.includes("accessBlocked"), "layout does not lock the owner out");
console.log("PASS: header, drawer, light/dark tokens, and disabled actions");

assert(loader.includes("where: { id: companyId }"), "plan read is scoped to the session company");
assert(loader.includes("if (!companyId) return null"), "empty company id is refused");
assert(!loader.includes("endDate"), "loader does not trust a stored expiry");
assert(loader.includes("BUSINESS_PLAN_ACCESS_ENFORCEMENT_ENABLED"), "loader uses the enforcement flag");
assert(!loader.includes("findMany"), "loader does not scan every company");
console.log("PASS: tenancy scope");

assert(admin.includes("data: { durationDays }"), "duration edit writes only the plan duration");
assert(admin.includes("data: { extraDays: nextExtraDays }"), "extension edit writes only extra days");
assert(admin.includes("registeredAt: company.createdAt"), "new entitlement rows copy the registration date");
assert(admin.includes("startDate: company.createdAt"), "new entitlement rows do not invent a later start");
assert(!admin.includes("new Date()"), "admin mutations do not stamp a fresh start");
console.log("PASS: duration and extension mutations keep the registration anchor");

assert(!/DROP TABLE|TRUNCATE|DELETE FROM "companies"|DELETE FROM "subscriptions"/i.test(migration), "migration is non-destructive");
assert(migration.includes('ADD COLUMN "duration_days"'), "migration adds configurable duration");
assert(migration.includes("'block_access', 'fallback_to_free'"), "migration represents both expiry behaviors");
assert(migration.includes('ADD COLUMN "grace_period_days"'), "migration adds grace period");
assert(migration.includes('ADD COLUMN "extra_days"'), "migration adds per-account extra days");
assert(migration.includes("saas_payment_records"), "migration adds payment records");
assert(migration.includes("saas_account_extensions"), "migration adds the extension ledger");
assert(!/ALTER TABLE "customer_subscriptions"|ALTER TABLE "subscription_plans"|DROP TABLE "customer_subscriptions"/i.test(migration), "migration leaves customer memberships alone");
assert(!migration.includes('SET "start_date"'), "migration does not rewrite subscription start dates");
assert(migration.includes('SET "registered_at" = company."created_at"'), "registration copy uses the existing company timestamp");
assert(schema.includes("model CustomerSubscription"), "customer subscriptions remain");
assert(schema.includes("model SubscriptionPlan"), "store membership plans remain");
console.log("PASS: migration is additive and membership tables are untouched");

for (const directory of ["features/membership-levels", "features/customers", "features/pos"]) {
  for (const file of filesUnder(directory)) {
    const source = readFileSync(file, "utf8");
    assert(!source.includes("@/features/business-plan"), `${file} must not depend on business plan status`);
  }
}
console.log("PASS: membership, customers, and POS modules are unchanged");

assert(paymentPort.includes("not_integrated"), "payment gateways stay unwired");
assert(!paymentPort.includes("fetch("), "payment port does not call a provider");
assert(paymentPort.includes("static_qr") && paymentPort.includes("card"), "future payment methods are named");
console.log("PASS: payment foundation has no live gateway");
