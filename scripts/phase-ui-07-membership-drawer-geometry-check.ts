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
const contentFnStart = drawerFn.indexOf("\nfunction DrawerContent(");
const wideDrawerFn = contentFnStart >= 0 ? drawerFn.slice(0, contentFnStart) : drawerFn;

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-background shadow-2xl"';
const drawerContentClass = '"grid w-full min-w-0 gap-5"';

check(
  "1. outer drawer remains lg:left-72",
  wideDrawerFn.includes(overlay) &&
    wideDrawerFn.includes("lg:left-72") &&
    !wideDrawerFn.includes("md:left-72") &&
    !wideDrawerFn.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. outer shell remains w-full max-w-none",
  wideDrawerFn.includes(panel) &&
    wideDrawerFn.includes("h-full") &&
    wideDrawerFn.includes("w-full") &&
    wideDrawerFn.includes("max-w-none") &&
    !wideDrawerFn.includes("flex justify-end overflow-x-hidden"),
);

check(
  "3. no max-w-5xl returns to the outer shell",
  !wideDrawerFn.includes("max-w-5xl") &&
    !wideDrawerFn.includes("max-w-4xl") &&
    !wideDrawerFn.includes("max-w-3xl") &&
    count(client, "max-w-5xl") === 0 &&
    count(client, "max-w-4xl") === 0,
);

check(
  "4. Create/Edit/View/Filters use one shared inner layout system",
  client.includes("function DrawerContent(") &&
    client.includes(drawerContentClass) &&
    count(client, "<DrawerContent") === 3 &&
    count(client, "<WideDrawer") === 3 &&
    count(client, "function WideDrawer(") === 1 &&
    wideDrawerFn.includes("px-6 py-4 lg:px-8") &&
    wideDrawerFn.includes("px-6 py-5 lg:px-8") &&
    wideDrawerFn.includes("footer ? (") &&
    client.includes('drawer?.type === "create" || drawer?.type === "edit"') &&
    client.includes('drawer?.type === "view"') &&
    client.includes('drawer?.type === "filters"'),
);

check(
  "5. Create/Edit use balanced desktop form layout",
  client.includes("<LevelForm form={form} onSave={saveLevel} onUpdate={update} />") &&
    client.includes('id="membership-level-form"') &&
    client.includes("md:grid-cols-2 lg:gap-6") &&
    client.includes("copy(\"levelInformation\")") &&
    client.includes("copy(\"membershipRules\")") &&
    !client.includes("mx-auto grid w-full max-w-4xl") &&
    client.includes('form="membership-level-form"'),
);

check(
  "6. View uses the same content width/alignment",
  client.includes("<LevelDetails level={drawer.level} />") &&
    client.includes("function LevelDetails(") &&
    client.includes("sm:grid-cols-2 xl:grid-cols-3") &&
    client.includes("copy(\"posDiscountNote\")") &&
    !client.includes("mx-auto grid w-full max-w-4xl"),
);

check(
  "7. Filters uses the same content padding/alignment",
  client.includes("<WideDrawer") &&
    client.includes('title={copy("filters")}') &&
    client.includes("<FormSection compact title={copy(\"status\")}>") &&
    client.includes("copy(\"clearFilters\")") &&
    !client.includes("mx-auto grid w-full max-w-3xl") &&
    client.includes("<DrawerContent>"),
);

check(
  "8. no horizontal overflow introduced",
  wideDrawerFn.includes("overflow-x-hidden") &&
    wideDrawerFn.includes("min-w-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto") === false &&
    wideDrawerFn.includes("overflow-x-hidden overflow-y-auto") &&
    client.includes('className="grid w-full min-w-0 gap-5"') &&
    client.includes("min-w-0 rounded-lg border border-border bg-card") &&
    client.includes("grid min-w-0 gap-4"),
);

check(
  "9. mobile/tablet can collapse to single-column",
  client.includes("md:grid-cols-2 lg:gap-6") &&
    client.includes("sm:grid-cols-2 xl:grid-cols-3") &&
    client.includes('compact ? "grid min-w-0 gap-4"') &&
    client.includes("flex-wrap gap-2") &&
    !wideDrawerFn.includes("grid-cols-4") &&
    !client.includes("md:grid-cols-2 lg:grid-cols-4"),
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
    client.includes('"archiveConfirm"') &&
    client.includes('"deleteConfirm"') &&
    !client.includes("window.confirm") &&
    client.includes("<AppSmallModal") &&
    page.includes("getMembershipLevels") &&
    actions.includes("createMembershipLevelAction") &&
    suppliersList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"') &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-07-membership-drawer-geometry-check: PASS");
