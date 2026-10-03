import { FINE, FINE_MARKER, grantExceedsActor, legacyFineKeys, redactSensitiveFields, reportRangeNeedsHistorical, reportVisibility } from "@/features/access-control/fine-permissions";
import { permissionKeysForDraft, recommendedRoleDraft } from "@/features/access-control/role-permission-v2";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

const cashier = recommendedRoleDraft("Staff/Cashier");
const manager = recommendedRoleDraft("Manager");
const cashierSaved = permissionKeysForDraft(cashier, ["pos.view", "pos.create", "pos.print"]);
const reportsOff = {
  ...manager,
  reports: { ...manager.reports, advanced: { ...manager.reports.advanced, "reports.profit": false, "reports.cost": false, "reports.margin": false, "reports.historical": false, "reports.export": false } },
};
const reportsSaved = permissionKeysForDraft(reportsOff, []);
const todayOff = {
  ...manager,
  reports: { ...manager.reports, enabled: true, advanced: { ...manager.reports.advanced, "reports.today": false, "reports.historical": true } },
};
const todaySaved = permissionKeysForDraft(todayOff, []);

check("cashier keeps sell and safe POS actions", cashier.pos.advanced["pos.sell"] && cashier.pos.advanced["pos.hold"] && cashier.pos.advanced["pos.reprint"] && !cashier.pos.advanced["pos.refund"] && !cashier.pos.advanced["pos.discount"]);
check("cashier save writes hold and reprint", cashierSaved.includes(FINE.posHold) && cashierSaved.includes(FINE.posReprint) && !cashierSaved.includes(FINE.posRefund));
check("manager report toggles persist", permissionKeysForDraft(manager, []).includes(FINE.reportsProfit) && permissionKeysForDraft(manager, []).includes(FINE.reportsHistorical));
check("reports profit off is omitted", !reportsSaved.includes(FINE.reportsProfit) && !reportsSaved.includes(FINE.reportsCost) && !reportsSaved.includes(FINE.reportsMargin));
check("today can be off while historical stays on", !todaySaved.includes(FINE.reportsToday) && todaySaved.includes(FINE.reportsHistorical) && todaySaved.includes("reports.access"));
check("historical range is detected", reportRangeNeedsHistorical({ datePreset: "yesterday" }) && !reportRangeNeedsHistorical({ datePreset: "today" }));
check("profit redaction removes profit and keeps sales", (() => {
  const redacted = redactSensitiveFields({ netSalesLak: 10, profitTodayLak: 4, cogsLak: 2, marginPercent: 1 }, reportVisibility([]));
  return redacted.netSalesLak === 10 && !("profitTodayLak" in redacted) && !("cogsLak" in redacted) && !("marginPercent" in redacted);
})());
check("cost redaction keeps profit when cost is the only denial", (() => {
  const redacted = redactSensitiveFields({ costPriceLak: 5, sellingPriceLak: 9 }, { cost: false, margin: true, profit: true });
  return !("costPriceLak" in redacted) && redacted.sellingPriceLak === 9;
})());
check("grant limit blocks a higher role and a POS flag", grantExceedsActor({
  actorBackOffice: true,
  actorKeys: ["products.view"],
  actorPos: false,
  isOwner: false,
  nextBackOffice: true,
  nextPos: true,
  roleKeys: ["products.view"],
}) && !grantExceedsActor({
  actorBackOffice: true,
  actorKeys: ["products.view", FINE_MARKER],
  actorPos: true,
  isOwner: false,
  nextBackOffice: true,
  nextPos: true,
  roleKeys: ["products.view", FINE_MARKER],
}));
check("owner grant is not limited", !grantExceedsActor({
  actorBackOffice: false,
  actorKeys: [],
  actorPos: false,
  isOwner: true,
  nextBackOffice: true,
  nextPos: true,
  roleKeys: ["roles.manage"],
}));
check("cashier baseline does not receive profit", !legacyFineKeys(["pos.view", "pos.create", "reports.view"], "cashier").includes(FINE.reportsProfit));
check("manager baseline receives adjustment", legacyFineKeys(["inventory.edit"], "manager").includes("inventory.adjust"));

if (failed) process.exit(1);
console.log("phase-fine-permissions-check: PASS");
