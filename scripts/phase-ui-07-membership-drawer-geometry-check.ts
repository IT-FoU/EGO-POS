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

const client = read("features/membership-levels/components/membership-levels-client.tsx");
const page = read("app/(dashboard)/membership-levels/page.tsx");
const actions = read("features/membership-levels/actions.ts");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");

const drawerStart = client.indexOf("function WideDrawer(");
check("0. WideDrawer exists", drawerStart >= 0);
const drawerFn = client.slice(drawerStart);

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 flex justify-end overflow-x-hidden bg-black/45 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-5xl flex-col border-l border-border bg-background shadow-2xl"';

check(
  "1. WideDrawer uses the desktop Sidebar boundary",
  drawerFn.includes(overlay) &&
    drawerFn.includes("lg:left-72") &&
    !drawerFn.includes("md:left-72") &&
    !drawerFn.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. full-viewport scrim no longer covers Sidebar on desktop",
  drawerFn.includes(overlay) &&
    drawerFn.includes(panel) &&
    !drawerFn.includes("fixed bottom-0 right-0 top-0") &&
    !drawerFn.includes("flex w-full justify-end bg-black/45") &&
    !drawerFn.includes("inset-0"),
);

check(
  "3. Create Level uses the repaired WideDrawer frame",
  client.includes('drawer?.type === "create" || drawer?.type === "edit"') &&
    client.includes("<WideDrawer title={drawer.type === \"create\" ? copy(\"createLevel\") : copy(\"editLevel\")}") &&
    client.includes("onClick={openCreateDrawer}") &&
    client.includes('setDrawer({ type: "create" })'),
);

check(
  "4. Edit Level uses the repaired WideDrawer frame",
  client.includes("function openEditDrawer(") &&
    client.includes('setDrawer({ type: "edit", level })') &&
    client.includes("onClick={() => openEditDrawer(level)}") &&
    client.includes("<LevelForm form={form} isPending={isPending} onCancel={() => setDrawer(null)} onSave={saveLevel} onUpdate={update} />"),
);

check(
  "5. View Level uses the repaired WideDrawer frame",
  client.includes('drawer?.type === "view"') &&
    client.includes("<WideDrawer title={drawer.level.name}") &&
    client.includes("<LevelDetails level={drawer.level} onEdit={() => openEditDrawer(drawer.level)} />") &&
    client.includes('setDrawer({ type: "view", level })'),
);

check(
  "6. Filters uses the repaired WideDrawer frame",
  client.includes('drawer?.type === "filters"') &&
    client.includes("<WideDrawer title={copy(\"filters\")}") &&
    client.includes('onClick={() => setDrawer({ type: "filters" })}') &&
    client.includes("setStatusFilter") &&
    client.includes("clearFilters"),
);

check(
  "7. Membership business logic remains unchanged",
  client.includes("createMembershipLevelAction") &&
    client.includes("updateMembershipLevelAction") &&
    client.includes("archiveMembershipLevelAction") &&
    client.includes("if (form.discountPercent < 0 || form.discountPercent > 100)") &&
    client.includes("if (form.minSpendLak < 0)") &&
    client.includes("discountPercent: form.discountPercent") &&
    client.includes("minSpendLak: form.minSpendLak") &&
    client.includes("window.confirm(copy(\"archiveConfirm\"))") &&
    client.includes("window.confirm(copy(\"deleteConfirm\"))") &&
    page.includes("getMembershipLevels") &&
    actions.includes("createMembershipLevelAction") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-07-membership-drawer-geometry-check: PASS");
