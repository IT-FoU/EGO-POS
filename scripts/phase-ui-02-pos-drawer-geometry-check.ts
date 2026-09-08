import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

const frame = read("features/pos/components/pos-workspace-modal.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const ownShift = read("features/pos/components/own-shift-report-drawer.tsx");
const cashInOut = read("features/pos/components/cash-in-out-modal.tsx");
const returnExchange = read("features/pos/components/return-exchange-void-modal.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posActions = read("features/pos/actions.ts");

const overlayClass =
  'className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"';
const panelClass =
  'className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';

check(
  "1. large POS frame uses correct desktop Sidebar offset",
  frame.includes(overlayClass) &&
    frame.includes("lg:left-72") &&
    !frame.includes("md:left-72") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. large POS frame no longer uses centered 85vw geometry as its outer surface",
  !frame.includes("inset-0") &&
    !frame.includes("items-center justify-center") &&
    !frame.includes("h-[85dvh]") &&
    !frame.includes("w-[85vw]") &&
    !frame.includes("max-w-[1280px]") &&
    !frame.includes("rounded-xl") &&
    frame.includes(panelClass),
);

check(
  "3. desktop Sidebar is not covered by large POS backdrop",
  frame.includes(overlayClass) &&
    !frame.includes("fixed inset-0") &&
    !frame.includes("bg-black/70 p-4") &&
    !overlayClass.includes("inset-0 z-[60] flex"),
);

check(
  "4. Recent Sales uses repaired frame",
  posClient.includes('<PosWorkspaceModal onClose={onClose} title={t("ui.recent.sales")}>'),
);

check(
  "5. Hold/Resume uses repaired frame if classified large",
  posClient.includes('<PosModal title={t("ui.hold.bills.resume.bills")}') &&
    posClient.includes("function PosModal(") &&
    posClient.includes("return <PosWorkspaceModal onClose={onClose} title={title}>{children}</PosWorkspaceModal>;"),
);

check(
  "6. Cash Shift Count uses repaired frame if classified large",
  posClient.includes('<PosModal title={t("ui.cash.shift.count")}'),
);

check(
  "7. Member Search uses repaired frame if classified large",
  posClient.includes('<PosModal title={t("ui.member.search")}'),
);

check(
  "8. Own Shift Report uses repaired frame",
  ownShift.includes("import { PosWorkspaceModal } from \"@/features/pos/components/pos-workspace-modal\"") &&
    ownShift.includes("<PosWorkspaceModal"),
);

check(
  "9. approved large POS drawers are not converted to centered small overlays",
  frame.includes(overlayClass) &&
    !frame.includes("fixed inset-0") &&
    posClient.includes("return <PosWorkspaceModal onClose={onClose} title={title}>{children}</PosWorkspaceModal>;") &&
    posClient.includes('<PosWorkspaceModal onClose={onClose} title={t("ui.recent.sales")}>') &&
    posClient.includes('<PosWorkspaceModal headerClassName="print:hidden" onClose={onClose} title={t("ui.receipt.preview")}>'),
);

check(
  "10. POS business logic is unchanged",
    posClient.includes("async function holdSale") &&
    posClient.includes("async function resumeSale") &&
    posClient.includes("function completeSale()") &&
    cashInOut.includes('<div className="mx-auto grid max-w-xl gap-4">') &&
    returnExchange.includes("<PosWorkspaceModal onClose={onClose} title={tPos(\"ui.return.exchange.void\")}>") &&
    posActions.includes("export async function completeSaleAction") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"'),
);

check(
  "11. other large POS surfaces inherit the shared frame",
  posClient.includes('<PosModal title={t("ui.more")}') &&
    posClient.includes('<PosModal title={t("ui.favorites")}') &&
    posClient.includes('<PosWorkspaceModal headerClassName="print:hidden" onClose={onClose} title={t("ui.receipt.preview")}>') &&
    posClient.includes("return (<PosModal title={title} onClose={onClose}>") &&
    cashInOut.includes('<PosWorkspaceModal onClose={onClose} title={t("ui.cash.in.cash.out")}>'),
);

console.log("\nphase-ui-02-pos-drawer-geometry-check: PASS");
