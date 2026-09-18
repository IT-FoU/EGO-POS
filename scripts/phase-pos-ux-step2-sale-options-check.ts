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

const drawer = read("features/pos/components/sale-options-drawer.tsx");
const frame = read("features/pos/components/pos-workspace-modal.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const copy = read("lib/i18n/pos-copy.ts");

check(
  "1. Sale Options drawer reuses PosWorkspaceModal",
  drawer.includes('from "@/features/pos/components/pos-workspace-modal"') &&
    drawer.includes("<PosWorkspaceModal") &&
    drawer.includes('title={t("ui.sale.options")}'),
);

check(
  "2. Workspace modal keeps Sidebar-offset large drawer geometry",
  frame.includes("lg:left-72") &&
    frame.includes("z-[60]") &&
    frame.includes("fixed inset-y-0 left-0 right-0") &&
    !frame.includes("items-center justify-center"),
);

check(
  "3. Sale Options entry is before Payment in Shopping Cart",
  posClient.includes('t("ui.sale.options")') &&
    posClient.includes("openSaleOptions") &&
    posClient.indexOf("openSaleOptions") < posClient.indexOf('t("ui.payment")'),
);

check(
  "4. Drawer Cancel / Apply wired without payment engines",
  posClient.includes("cancelSaleOptions") &&
    posClient.includes("applySaleOptions") &&
    drawer.includes('t("ui.cancel")') &&
    drawer.includes('t("ui.apply")') &&
    !drawer.includes("setDiscountPercent") &&
    !drawer.includes("discountPercent"),
);

check(
  "5. Five STEP 2 section shells present",
  drawer.includes('t("ui.subscriber")') &&
    drawer.includes('t("ui.promotions")') &&
    drawer.includes('t("ui.discount")') &&
    drawer.includes('t("ui.points.loyalty")') &&
    drawer.includes('t("ui.coupon.voucher")') &&
    drawer.includes('t("ui.no.subscriber.selected")') &&
    drawer.includes('t("ui.no.promotions.applied")'),
);

check(
  "6. Cashier cannot edit subscriber discount % in STEP 2 shell",
  drawer.includes("subscriber.cashier.note") &&
    !drawer.includes('type="number"') &&
    !drawer.includes("discount %") &&
    !posClient.includes("subscriberDiscountPercent"),
);

check(
  "7. i18n keys exist for Sale Options (en + lo)",
  copy.includes('"ui.sale.options": "Sale Options"') &&
    copy.includes('"ui.sale.options": "ຕົວເລືອກການຂາຍ"') &&
    copy.includes('"ui.subscriber": "Subscriber"') &&
    copy.includes('"ui.subscriber": "ສະມາຊິກ"') &&
    copy.includes('"ui.no.subscriber.selected"') &&
    copy.includes('"ui.coupon.voucher"'),
);

check(
  "8. Opening Sale Options does not call cart/total mutators in helpers",
  (() => {
    const helpers = [
      posClient.match(/function openSaleOptions\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
      posClient.match(/function cancelSaleOptions\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
      posClient.match(/function applySaleOptions\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
    ];
    if (helpers.some((h) => !h)) return false;
    return helpers.every(
      (h) =>
        !h.includes("setCartItems") &&
        !h.includes("setCashAmount") &&
        !h.includes("setQrAmount") &&
        !h.includes("setTransferAmount") &&
        !h.includes("setCardAmount") &&
        !h.includes("setPaymentMode") &&
        !h.includes("setSelectedCustomer"),
    );
  })(),
);

console.log("\nSTEP 2 Sale Options source check PASSED");
