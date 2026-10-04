/**
 * Focused Phase 6 POS terminal checks. No browser, no production database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandPhase3Keys } from "../features/access-control/phase3-permissions";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const checks: Array<[string, () => void]> = [];
function check(name: string, fn: () => void) {
  checks.push([name, fn]);
}

const prismaClient = read("lib/db/prisma.ts");
const service = read("features/terminals/terminal-service.ts");
const panel = read("features/terminals/components/terminals-panel.tsx");
const bindRoute = read("app/api/settings/terminals/[id]/bind/route.ts");
const createRoute = read("app/api/settings/terminals/route.ts");
const migration = read("prisma/migrations/20261004193000_pos_terminals/migration.sql");
const sale = read("features/pos/prisma-repository.ts");
const cash = read("features/cash-sessions/prisma-repository.ts");
const permissions = read("lib/auth/permissions.ts");
const phase3 = read("features/access-control/phase3-permissions.ts");
const cookie = read("features/terminals/device-cookie.ts");
const schema = read("prisma/schema.prisma");

check("request scoped prisma client", () => {
  assert(prismaClient.includes("ego.pos.requestPrisma"), "request client missing");
  assert(!prismaClient.includes("now - burst.at < 10"), "cpu burst window still present");
  assert(prismaClient.includes("Do not cache it on the isolate"), "isolate reuse warning missing");
});

check("migration is company scoped", () => {
  assert(migration.includes('CREATE TABLE "pos_terminals"'), "terminal table missing");
  assert(migration.includes("pos_terminals_company_id_terminal_code_key"), "company code unique missing");
  assert(migration.includes('ALTER TABLE "sales" ADD COLUMN "terminal_id"'), "sale terminal missing");
  assert(migration.includes('ALTER TABLE "cash_sessions" ADD COLUMN "terminal_id"'), "shift terminal missing");
  assert(schema.includes("model PosTerminal"), "prisma model missing");
});

check("settings create requires terminal edit", () => {
  assert(createRoute.includes("WRITE_PERMISSIONS.terminalsEdit"), "create permission missing");
  assert(permissions.includes('terminalsEdit: "settings.terminals.edit"'), "edit key missing");
  assert(permissions.includes('terminalsView: "settings.terminals.view"'), "view key missing");
  assert(phase3.includes('"pos-terminals": { edit: "settings.terminals.edit"'), "section gate missing");
});

check("device binding cannot be spoofed", () => {
  assert(cookie.includes("httpOnly: true"), "device cookie is not httpOnly");
  assert(bindRoute.includes("body.deviceId") && bindRoute.includes("does not match this browser"), "device mismatch check missing");
  assert(service.includes("already bound to another store"), "cross-store bind missing");
  assert(service.includes("Close this terminal's cash shift before binding a different device."), "open-shift rebind guard missing");
  assert(service.includes("Close this terminal's cash shift before unbinding"), "unbind guard missing");
  assert(service.includes("Close this terminal's cash shift before disabling it."), "disable guard missing");
});

check("sale persists the bound terminal", () => {
  assert(sale.includes("requireActiveBoundTerminal"), "sale terminal check missing");
  assert(sale.includes("terminalId: terminal.id"), "sale terminal id not persisted");
  assert(sale.includes("cashSession.terminalId !== terminal.id"), "sale shift mismatch check missing");
});

check("cash shift is terminal scoped", () => {
  assert(cash.includes("terminalId: terminal.id"), "open shift terminal missing");
  assert(cash.includes("An open cash session already exists for this terminal."), "one open shift per terminal missing");
  assert(cash.includes("This cash session belongs to another terminal."), "shift device check missing");
  assert(cash.includes("status: \"ACTIVE\""), "refund/exchange terminal lookup missing");
});

check("terminal settings follow the settings grant", () => {
  const cashier = expandPhase3Keys(["pos.sell", "pos.view"], "cashier");
  assert(!cashier.includes("settings.terminals.edit"), "pos cashier inherited terminal edit");
  const phase3Cashier = expandPhase3Keys(["access.phase3", "pos.sell", "settings.receipt.view"], "cashier");
  assert(!phase3Cashier.includes("settings.terminals.edit"), "phase3 cashier inherited terminal edit");
  const legacyManager = expandPhase3Keys(["settings.view", "settings.manage"], "manager");
  assert(legacyManager.includes("settings.terminals.view") && legacyManager.includes("settings.terminals.edit"), "legacy settings manager lost terminal access");
  const explicit = expandPhase3Keys(["access.phase3", "settings.terminals.view"], "manager");
  assert(explicit.includes("settings.terminals.view") && !explicit.includes("settings.terminals.edit"), "view grant became edit");
});

check("add terminal keeps the name when save fails", () => {
  assert(panel.includes("if (saved) setName(\"\")"), "failed add clears the name");
  assert(panel.includes("/api/settings/terminals"), "add endpoint missing");
});

check("terminal edit and delete stay safe", () => {
  const route = read("app/api/settings/terminals/[id]/route.ts");
  assert(panel.includes("terminalCodeLabel") && !panel.includes("terminalCode:"), "edit exposes terminal code as a field");
  assert(panel.includes("ownerPassword") && panel.includes("bg-danger"), "delete confirmation missing");
  assert(service.includes("Only the owner can delete a terminal."), "owner delete gate missing");
  assert(service.includes("Close this terminal's cash shift before deleting it."), "open shift delete guard missing");
  assert(service.includes("Unbind this device before deleting the terminal."), "bound delete guard missing");
  assert(service.includes('status: "ARCHIVED"'), "history archive missing");
  assert(service.includes("posTerminal.delete"), "unused hard delete missing");
  assert(service.includes('status: { not: "ARCHIVED" }'), "archived terminals stay in the list");
  assert(route.includes("deleteStoreTerminal") && route.includes("WRITE_PERMISSIONS.terminalsEdit"), "delete permission missing");
  assert(service.includes("Terminal code stays fixed after the terminal is created."), "code lock missing");
});

let failed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name} ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed) {
  console.log(`POS_TERMINALS_CHECK failed=${failed}`);
  process.exit(1);
}
console.log(`POS_TERMINALS_CHECK passed=${checks.length}`);
