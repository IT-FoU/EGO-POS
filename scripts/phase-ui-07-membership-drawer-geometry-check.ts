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

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const client = read("features/membership-levels/components/membership-levels-client.tsx");
const page = read("app/(dashboard)/membership-levels/page.tsx");
const actions = read("features/membership-levels/actions.ts");
const suppliersList = read("features/suppliers/components/suppliers-list-client.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");

const drawerStart = client.indexOf("function WideDrawer(");
check("0. WideDrawer exists", drawerStart >= 0);
const drawerFn = client.slice(drawerStart);
const nextFn = drawerFn.indexOf("\nfunction FormSection(");
const wideDrawerFn = nextFn >= 0 ? drawerFn.slice(0, nextFn) : drawerFn;

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-background shadow-2xl"';

check(
  "1. WideDrawer outer frame uses lg:left-72",
  wideDrawerFn.includes(overlay) &&
    wideDrawerFn.includes("lg:left-72") &&
    !wideDrawerFn.includes("md:left-72") &&
    !wideDrawerFn.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. visible LARGE drawer panel uses full available width",
  wideDrawerFn.includes(panel) &&
    wideDrawerFn.includes("h-full") &&
    wideDrawerFn.includes("w-full") &&
    wideDrawerFn.includes("max-w-none") &&
    !wideDrawerFn.includes("flex justify-end") &&
    !wideDrawerFn.includes("justify-end"),
);

check(
  "3. no max-w-5xl remains on the Membership large drawer shell",
  !wideDrawerFn.includes("max-w-5xl") &&
    !wideDrawerFn.includes("max-w-4xl") &&
    !wideDrawerFn.includes("max-w-3xl") &&
    !wideDrawerFn.includes("max-w-2xl") &&
    !wideDrawerFn.includes("max-w-xl") &&
    count(client, "max-w-5xl") === 0,
);

check(
  "4. Create Level uses the full-width WideDrawer",
  client.includes('drawer?.type === "create" || drawer?.type === "edit"') &&
    client.includes("<WideDrawer title={drawer.type === \"create\" ? copy(\"createLevel\") : copy(\"editLevel\")}") &&
    client.includes("onClick={openCreateDrawer}") &&
    client.includes('setDrawer({ type: "create" })'),
);

check(
  "5. Edit Level uses the full-width WideDrawer",
  client.includes("function openEditDrawer(") &&
    client.includes('setDrawer({ type: "edit", level })') &&
    client.includes("onClick={() => openEditDrawer(level)}") &&
    client.includes("<LevelForm form={form} isPending={isPending} onCancel={() => setDrawer(null)} onSave={saveLevel} onUpdate={update} />"),
);

check(
  "6. View Level uses the full-width WideDrawer",
  client.includes('drawer?.type === "view"') &&
    client.includes("<WideDrawer title={drawer.level.name}") &&
    client.includes("<LevelDetails level={drawer.level} onEdit={() => openEditDrawer(drawer.level)} />") &&
    client.includes('setDrawer({ type: "view", level })'),
);

check(
  "7. Filters uses the SAME full-width WideDrawer geometry",
  client.includes('drawer?.type === "filters"') &&
    client.includes("<WideDrawer title={copy(\"filters\")}") &&
    client.includes('onClick={() => setDrawer({ type: "filters" })}') &&
    count(client, "<WideDrawer") === 3 &&
    count(client, "function WideDrawer(") === 1,
);

check(
  "8. no large Membership surface has a different width",
  count(wideDrawerFn, overlay) === 1 &&
    count(wideDrawerFn, panel) === 1 &&
    !client.includes("fixed bottom-0 right-0 top-0") &&
    !client.includes("max-w-5xl"),
);

check(
  "9. Sidebar remains outside the overlay",
  wideDrawerFn.includes("lg:left-72") &&
    wideDrawerFn.includes("inset-y-0") &&
    wideDrawerFn.includes("right-0") &&
    !wideDrawerFn.includes("inset-0") &&
    !wideDrawerFn.includes("fixed bottom-0 right-0 top-0"),
);

check(
  "10. Membership business logic remains unchanged",
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
    suppliersList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"') &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-07-membership-drawer-geometry-check: PASS");
