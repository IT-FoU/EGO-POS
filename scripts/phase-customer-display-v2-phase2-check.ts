import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  customerDisplaySettingsNeedTemplateMigration,
  normalizeCustomerDisplaySettings,
} from "../features/pos/customer-display-settings";
import {
  CUSTOMER_DISPLAY_TEMPLATES,
  parseCustomerDisplayTemplate,
  customerDisplayTemplateTokens,
} from "../features/pos/customer-display-templates";
import {
  customerDisplayMemberName,
  customerDisplayShouldShowDiscountRows,
  customerDisplayShouldShowPromotionInfo,
  customerDisplayShouldShowSubtotal,
  resolveCustomerDisplayIdleSlide,
  resolveCustomerDisplayMode,
} from "../features/pos/customer-display-rules";
import { fillCustomerDisplayCopy, tCd } from "../features/pos/customer-display-copy";
import { readSettingsUi } from "./settings-ui-sources";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const displayClient = readFileSync(join(root, "features/pos/components/customer-display-client.tsx"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const settingsForm = readSettingsUi(root);
const qrToggle = readFileSync(join(root, "components/layout/customer-display-qr-toggle.tsx"), "utf8");
const windowHelper = readFileSync(join(root, "features/pos/customer-display-window.ts"), "utf8");
const imageHelper = readFileSync(join(root, "features/pos/customer-display-product-image.ts"), "utf8");
const templates = readFileSync(join(root, "features/pos/customer-display-templates.ts"), "utf8");

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

check("exactly 5 selectable templates and legacy IDs map safely", () => {
  assert(CUSTOMER_DISPLAY_TEMPLATES.length === 5, String(CUSTOMER_DISPLAY_TEMPLATES.length));
  assert(parseCustomerDisplayTemplate("ocean-blue") === "ocean-blue", "ocean-blue");
  assert(parseCustomerDisplayTemplate("bold-green") === "bold-green", "bold-green");
  assert(parseCustomerDisplayTemplate("sky-blue") === "sky-blue", "sky-blue");
  assert(parseCustomerDisplayTemplate("sunny-yellow") === "sunny-yellow", "sunny-yellow");
  assert(parseCustomerDisplayTemplate("premium-dark") === "premium-dark", "premium-dark");
  assert(parseCustomerDisplayTemplate("emerald-dream") === "sunny-yellow", "emerald-dream");
  assert(parseCustomerDisplayTemplate("coral-minimal") === "premium-dark", "coral-minimal");
  assert(parseCustomerDisplayTemplate("premium-dark-green") === "premium-dark", "premium-dark-green");
  assert(parseCustomerDisplayTemplate("minimal-premium-red") === "ocean-blue", "minimal-premium-red");
  assert(parseCustomerDisplayTemplate("minimal-premium-purple") === "sky-blue", "minimal-premium-purple");
  assert(parseCustomerDisplayTemplate("ads_checkout") === "sky-blue", "ads_checkout");
  assert(parseCustomerDisplayTemplate("classic_checkout") === "ocean-blue", "classic_checkout");
  assert(parseCustomerDisplayTemplate("follow-pos") === "premium-dark", "follow-pos");
  assert(parseCustomerDisplayTemplate("fresh-green") === "bold-green", "fresh-green");
  assert(parseCustomerDisplayTemplate("fullscreen_promotion") === "premium-dark", "fullscreen_promotion");
  assert(parseCustomerDisplayTemplate("qr_focus") === "ocean-blue", "qr_focus");
  assert(parseCustomerDisplayTemplate("vip_membership") === "sunny-yellow", "vip_membership");
  assert(parseCustomerDisplayTemplate("unknown-template-id") === "ocean-blue", "unknown");
  assert(parseCustomerDisplayTemplate(undefined) === "ocean-blue", "missing");
  assert(parseCustomerDisplayTemplate(null) === "ocean-blue", "corrupt null");
  const migrated = normalizeCustomerDisplaySettings({
    autoReturnSeconds: 9,
    media: [{ id: "img", name: "a.png", type: "image", url: "https://cdn.test/a.png" }],
    promotionMessages: ["Keep this"],
    qrDisplayStyle: "black-gold",
    showDiscountDetails: false,
    showPromotionInformation: false,
    template: "emerald-dream",
  });
  assert(migrated.template === "sunny-yellow", "normalized template");
  assert(migrated.autoReturnSeconds === 9 && migrated.media.length === 1, "unrelated settings stay");
  assert(migrated.showDiscountDetails === false && migrated.showPromotionInformation === false, "visibility stays");
  assert(migrated.promotionMessages[0] === "Keep this", "message stays");
  assert(customerDisplaySettingsNeedTemplateMigration({ template: "emerald-dream" }) === true, "persist removed id");
  assert(customerDisplaySettingsNeedTemplateMigration({ template: "ocean-blue" }) === false, "do not rewrite surviving id");
  assert(normalizeCustomerDisplaySettings({ template: { bad: true } }).template === "ocean-blue", "corrupt object falls back");
});

check("redesigned 1-5 tokens stay distinct from 6-10", () => {
  const ocean = customerDisplayTemplateTokens("ocean-blue");
  const navy = customerDisplayTemplateTokens("bold-green");
  const sky = customerDisplayTemplateTokens("sky-blue");
  const violet = customerDisplayTemplateTokens("sunny-yellow");
  const red = customerDisplayTemplateTokens("premium-dark");
  assert(ocean.background === "#13670B" && ocean.accent === "#C6FF34", JSON.stringify(ocean));
  assert(navy.background === "#003A70" && navy.primary === "#FF5F00", JSON.stringify(navy));
  assert(sky.accent === "#FFCB05" && sky.background === "#003A70", JSON.stringify(sky));
  assert(violet.background === "#000000" && violet.primary === "#7F3AED" && violet.accent === "#C6FF34", JSON.stringify(violet));
  assert(red.primary === "#EB001B" && red.accent === "#FF5F00", JSON.stringify(red));
  assert(!(CUSTOMER_DISPLAY_TEMPLATES as readonly string[]).includes("emerald-dream"), "removed ids must leave the selectable list");
  assert(!displayClient.includes("function EmeraldDreamLayout"), "template 6 layout must be removed");
  assert(!displayClient.includes("function CoralMinimalLayout"), "template 7 layout must be removed");
  assert(!displayClient.includes("function PremiumDarkGreenLayout"), "template 8 layout must be removed");
  assert(!displayClient.includes("function MinimalRedLayout"), "template 9 layout must be removed");
  assert(!displayClient.includes("function MinimalPurpleLayout"), "template 10 layout must be removed");
});

check("QR overlay and window transport stay unchanged", () => {
  assert(displayClient.includes("showQr && displayState.selectedQrBank"), "QR overlay contract missing");
  assert(displayClient.includes("QrOverlay"), "QR overlay missing");
  assert(qrToggle.includes("function toggleQr()"), "Show/Hide QR missing");
  assert(windowHelper.includes("CUSTOMER_DISPLAY_WINDOW_NAME"), "named popup missing");
  assert(!displayClient.includes("WebSocket") && !windowHelper.includes("BroadcastChannel"), "no new channel");
  assert(imageHelper.includes("unit-thumbnail"), "sold-unit image priority missing");
});

check("member rule is name-only", () => {
  assert(customerDisplayMemberName({ customer: { name: "Noy" } as never }) === "Noy", "name");
  assert(customerDisplayMemberName({ customer: null }) === null, "no member");
  assert(!displayClient.includes("data-cd-member-field=\"points\""), "points leaked");
  assert(!displayClient.includes("data-cd-guest="), "guest leaked");
  assert(displayClient.includes("{tCd(\"member\", locale)}: {name}"), "Member: Name format missing");
});

check("discount and promotion visibility do not invent math", () => {
  const hidden = { showDiscountDetails: false, showPromotionInformation: true };
  const shown = { showDiscountDetails: true, showPromotionInformation: true };
  const promoOff = { showDiscountDetails: true, showPromotionInformation: false };
  const reduced = { promotionDiscountLak: 1000, manualDiscountLak: 500, loyaltyRedeemLak: 200, membershipDiscountLak: 0 };
  const memberOnly = { promotionDiscountLak: 0, manualDiscountLak: 0, loyaltyRedeemLak: 0, membershipDiscountLak: 1500 };
  assert(customerDisplayShouldShowDiscountRows(shown) === true, "default show");
  assert(customerDisplayShouldShowDiscountRows(hidden) === false, "hide rows");
  assert(customerDisplayShouldShowSubtotal(hidden, reduced) === false, "hide misleading subtotal");
  assert(customerDisplayShouldShowSubtotal(hidden, memberOnly) === false, "hide misleading membership subtotal");
  assert(customerDisplayShouldShowSubtotal(shown, reduced) === true, "show subtotal with rows");
  assert(customerDisplayShouldShowPromotionInfo(promoOff) === false, "hide promo info");
  assert(normalizeCustomerDisplaySettings({}).showDiscountDetails === true, "legacy settings default ON");
  assert(normalizeCustomerDisplaySettings({}).showPromotionInformation === true, "legacy promo default ON");
  assert(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.showDiscountDetails === true, "default discount on");
  assert(settingsForm.includes("showDiscountDetails") && settingsForm.includes("showPromotionInformation"), "settings toggles missing");
  assert(!posClient.includes("setPromotionDiscountTotal("), "must not rewrite POS promo math");
});

check("idle media priority and hide-on-cart", () => {
  const image = { id: "i", name: "a.png", type: "image" as const, url: "https://cdn.test/a.png" };
  const video = { id: "v", name: "a.mp4", type: "video" as const, url: "https://cdn.test/a.mp4" };
  assert(resolveCustomerDisplayIdleSlide({ media: [image, video], promotionMessages: ["Hi"] }, 0, ["Welcome"]).type === "image", "image first");
  assert(resolveCustomerDisplayIdleSlide({ media: [video], promotionMessages: ["Hi"] }, 0, ["Welcome"]).type === "video", "video next");
  assert(resolveCustomerDisplayIdleSlide({ media: [], promotionMessages: ["Hello store"] }, 0, ["Welcome"]).type === "message", "message fallback");
  assert(displayClient.includes("allowMedia = mode === \"idle\""), "cart must not keep idle media");
});

check("payment state uses existing displayMode", () => {
  assert(resolveCustomerDisplayMode({ displayMode: "advertising", items: [] }) === "idle", "idle");
  assert(resolveCustomerDisplayMode({ displayMode: "checkout", items: [{ id: "1" } as never] }) === "cart", "cart");
  assert(resolveCustomerDisplayMode({ displayMode: "payment", items: [{ id: "1" } as never] }) === "payment", "payment");
  assert(resolveCustomerDisplayMode({ displayMode: "thank_you", items: [{ id: "1" } as never] }) === "thank_you", "thank you");
  assert(posClient.includes('customerPaymentOpen ? "payment" : "checkout"'), "POS payment mode missing");
  assert(posClient.includes("manualDiscountLak: manualDiscountTotal"), "manual discount field missing");
  assert(posClient.includes("loyaltyRedeemLak: loyaltyRedeemDiscount"), "loyalty redeem field missing");
  assert(posClient.includes("setCustomerPaymentOpen(true)"), "payment open trigger missing");
});

check("localized chrome EN/LO", () => {
  assert(tCd("items", "en") === "Items" && tCd("items", "lo") !== tCd("items", "en"), tCd("items", "lo"));
  assert(tCd("grandTotal", "lo") !== tCd("grandTotal", "en"), tCd("grandTotal", "lo"));
  assert(tCd("member", "lo") !== tCd("member", "en"), tCd("member", "lo"));
  assert(fillCustomerDisplayCopy(tCd("returningIn", "en"), { seconds: 5 }).includes("5"), "return timer");
  assert(displayClient.includes("tCd(\"items\""), "items label missing");
  assert(displayClient.includes("tCd(\"scanToPay\""), "scan to pay missing");
  assert(displayClient.includes("data-cd-payment-badge"), "payment badge missing");
});

check("templates 1-5 use owner room geometry", () => {
  assert(displayClient.includes('data-cd-geometry="full"') && displayClient.includes('marker="full"') && displayClient.includes("grid-rows-1"), "t1 full room");
  assert(displayClient.includes('data-cd-geometry="columns-2"') && displayClient.includes('grid-cols-[1.15fr_0.85fr]') && displayClient.includes('marker="left"') && displayClient.includes('marker="right"'), "t2 columns");
  assert(displayClient.includes('data-cd-geometry="top-split"') && displayClient.includes("grid-rows-[minmax(0,0.78fr)_minmax(0,1.22fr)]") && displayClient.includes('marker="top"') && displayClient.includes('marker="bottom-left"') && displayClient.includes('marker="bottom-right"'), "t3 top split");
  assert(displayClient.includes('data-cd-geometry="grid-2x2"') && displayClient.includes("grid-cols-2 grid-rows-2") && displayClient.includes('marker="top-left"') && displayClient.includes('marker="bottom-right"'), "t4 grid");
  assert(displayClient.includes('data-cd-geometry="left-stack-right"') && displayClient.includes("grid-cols-[0.9fr_1.1fr] grid-rows-2") && displayClient.includes("row-span-2") && displayClient.includes('marker="left-top"') && displayClient.includes('marker="left-bottom"'), "t5 three rooms");
  assert(!displayClient.includes("function EmeraldDreamLayout"), "template 6 layout must stay removed");
});

check("thank-you and QR stay on existing channel", () => {
  assert(displayClient.includes("data-cd-thankyou=\"ocean-blue\""), "t1 thank you");
  assert(!displayClient.includes("data-cd-thankyou=\"emerald-dream\""), "t6 thank you must be gone");
  assert(posClient.includes("keepThankYou: true"), "auto-return snapshot remains");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length) process.exit(1);
