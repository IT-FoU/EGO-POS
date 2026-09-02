import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cancelStagedImage,
  confirmStagedImage,
  emptyStagedImage,
  isStagedImageDirty,
  previewStagedImage,
  removeStagedImage,
  selectStagedImage,
} from "../features/brand/staged-image";
import {
  buildCustomerDisplayQrCatalog,
  customerDisplayQrBanks,
} from "../features/pos/customer-display-qr";
import { resetAllCustomerDisplaySettings, resetCustomerDisplayAppearanceSettings } from "../features/pos/customer-display-settings";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const settingsForm = readFileSync(join(root, "features/settings/components/settings-form.tsx"), "utf8");
const actions = readFileSync(join(root, "features/qr-payments/actions.ts"), "utf8");
const repo = readFileSync(join(root, "features/qr-payments/prisma-repository.ts"), "utf8");

check("logo choose does not persist before confirm", () => {
  const draft = selectStagedImage(emptyStagedImage("saved.png"), "data:image/png;base64,new");
  assert(isStagedImageDirty(draft), "draft must be dirty");
  assert(previewStagedImage(draft) === "data:image/png;base64,new", "preview uses draft");
  assert(draft.saved === "saved.png", "saved value stays until confirm");
  assert(confirmStagedImage(draft).saved === "data:image/png;base64,new", "confirm persists draft");
  assert(cancelStagedImage(draft).saved === "saved.png", "cancel keeps previous saved");
  assert(removeStagedImage().saved === null, "remove clears");
  assert(settingsForm.includes("variant=\"settings\""), "settings preview uses bounded variant");
  assert(settingsForm.includes("confirmLogo") && settingsForm.includes("ui.confirm.logo"), "confirm logo missing");
  assert(settingsForm.includes("removeLogo") && settingsForm.includes("ui.remove.logo"), "remove logo missing");
});

check("reset this page restores the visible customer display section", () => {
  const reset = resetCustomerDisplayAppearanceSettings({
    autoReturnSeconds: 99,
    media: [{ id: "x", name: "x.png", type: "image", url: "https://example.com/x.png" }],
    promotionMessages: ["Custom"],
    qrDisplayStyle: "black-gold",
    template: "premium-dark",
  });
  const all = resetAllCustomerDisplaySettings();
  assert(reset.template === all.template && reset.qrDisplayStyle === all.qrDisplayStyle, "page reset must restore CD appearance");
  assert(reset.autoReturnSeconds === all.autoReturnSeconds, "page reset must restore timing");
  assert(reset.media.length === 0 && reset.promotionMessages.join("|") === all.promotionMessages.join("|"), "page reset must restore media and messages");
  assert(settingsForm.includes("resetAppearancePage") && settingsForm.includes("resetAllDisplaySettings"), "both reset actions must remain");
  assert(!settingsForm.includes("factory reset"), "must not touch whole-system reset");
});

check("add bank and add QR account keep existing actions", () => {
  assert(settingsForm.includes("saveQrPaymentBankAction") && settingsForm.includes("Add Bank"), "add bank missing");
  assert(settingsForm.includes("saveQrPaymentAccountAction") && settingsForm.includes("Add QR Account"), "add QR missing");
  assert(settingsForm.includes("applyQrLists") && settingsForm.includes("publishCustomerDisplayQrCatalog"), "list must update immediately");
  assert(actions.includes("saveQrPaymentBankAction") && actions.includes("saveQrPaymentAccountAction"), "server actions missing");
  assert(repo.includes("auditPayloadWithoutImages"), "do not store raw images in audit payload");
});

check("QR image workflow and delete stay account-scoped", () => {
  const selected = selectStagedImage(emptyStagedImage(), "data:image/png;base64,qr");
  assert(isStagedImageDirty(selected), "QR choose is preview only");
  assert(confirmStagedImage(selected).saved?.includes("data:image/png"), "confirm QR keeps the staged image");
  assert(settingsForm.includes("ui.confirm.qr") && settingsForm.includes("ui.replace.qr") && settingsForm.includes("ui.remove.qr"), "QR image actions missing");
  assert(settingsForm.includes("deleteQrPaymentAccountAction") && settingsForm.includes("accountToDelete"), "delete QR account missing");
  assert(repo.includes("Cannot delete a bank that still has QR accounts"), "bank delete must stay safe");
  const catalog = buildCustomerDisplayQrCatalog(
    [
      { id: "one", accountName: "One", accountNumber: "1", bankId: "b1", branchId: "br1", displayLabel: "One", isActive: true, isDefault: true, printOnReceipt: true, qrImageUrl: "https://example.com/one.png", showOnCustomerDisplay: true },
      { id: "two", accountName: "Two", accountNumber: "2", bankId: "b1", branchId: "br1", displayLabel: "Two", isActive: true, isDefault: false, printOnReceipt: true, qrImageUrl: "https://example.com/two.png", showOnCustomerDisplay: true },
    ],
    [{ bankName: "BCEL", id: "b1", isActive: true, shortCode: "BCEL", sortOrder: 1 }],
  );
  assert(catalog.map((bank) => bank.id).join(",") === "one,two", "multiple accounts must stay selectable");
  assert(customerDisplayQrBanks(catalog.filter((bank) => bank.id !== "two")).map((bank) => bank.id).join(",") === "one", "delete one account must keep the others");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length) {
  process.exit(1);
}
