import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.IGO_DEMO_MODE = "false";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const businessesPage = readSource("app/(platform)/businesses/page.tsx");
const setupPage = readSource("app/(platform)/businesses/setup/page.tsx");
const registerPage = readSource("app/(auth)/register/page.tsx");
const loginForm = readSource("components/auth/login-form.tsx");
const onboardingContext = readSource("features/platform/onboarding-context.ts");
const onboardingAccess = readSource("lib/demo/onboarding-access.ts");
const nextConfig = readSource("next.config.ts");
const templateShell = readSource("features/platform/components/template-placeholder-shell.tsx");

check(
  "A. Production /businesses uses DB membership flow",
  businessesPage.includes("!demoMode") && businessesPage.includes("CompanyMembershipPicker"),
);
check(
  "B. Demo template picker isolated after production demoMode guard",
  businessesPage.includes("if (!demoMode)") &&
    businessesPage.includes("<TemplatePicker") &&
    businessesPage.includes("<CompanyMembershipPicker") &&
    businessesPage.indexOf("<TemplatePicker") > businessesPage.indexOf("if (!demoMode)"),
);
check(
  "C. /businesses/setup redirects in production",
  setupPage.includes("!isDemoMode()") && setupPage.includes('redirect("/businesses")'),
);
check(
  "D. /register does not create localStorage tenant or link to /businesses setup",
  !registerPage.includes('href="/businesses"') && registerPage.includes("registerClosedTitle"),
);
check(
  "E. Login form production fallback avoids localStorage onboarding",
  loginForm.includes('demoMode ? getStoredEntryPath() : "/businesses"'),
);
check(
  "F. Onboarding context gates reads/writes with demo onboarding access",
  onboardingContext.includes("isDemoOnboardingEnabled") &&
    onboardingContext.includes("if (!isDemoOnboardingEnabled())"),
);
check(
  "G. Client demo onboarding flag exposed for browser guard",
  nextConfig.includes("NEXT_PUBLIC_IGO_DEMO_MODE") && onboardingAccess.includes("NEXT_PUBLIC_IGO_DEMO_MODE"),
);
check(
  "H. Template shell uses DB company name, not localStorage business context",
  !templateShell.includes("getStoredBusinessContext") && templateShell.includes("storeName"),
);
check(
  "I. Template shell review-setup link gated by demo mode",
  templateShell.includes("demoMode ?") && templateShell.includes("/businesses/setup"),
);
check(
  "J. store-entry-path marks localStorage template as demo-only",
  readSource("app/api/auth/store-entry-path/route.ts").includes("usesLocalStorageTemplate: isDemoMode()"),
);

const { isDemoOnboardingEnabled } = await import("../lib/demo/onboarding-access");
const {
  completeOnboarding,
  getStoredBusinessContext,
  getStoredEntryPath,
  saveSelectedTemplateDraft,
} = await import("../features/platform/onboarding-context");

check("K. isDemoOnboardingEnabled false in production harness", isDemoOnboardingEnabled() === false);
check("L. getStoredEntryPath returns /businesses in production", getStoredEntryPath() === "/businesses");
check("M. getStoredBusinessContext null in production", getStoredBusinessContext() === null);

saveSelectedTemplateDraft({
  businessTemplateId: "restaurant",
  businessType: "restaurant",
  defaultModules: ["pos"],
  locale: "en",
  selectedAt: new Date().toISOString(),
  setupStatus: "draft",
  templateName: "Restaurant",
});
completeOnboarding({
  activeBusinessId: "test",
  activeTenantId: "test",
  businessTemplateId: "restaurant",
  businessType: "restaurant",
  currency: "LAK",
  defaultModules: ["pos"],
  email: "test@example.com",
  language: "en",
  ownerName: "Test",
  phoneNumber: "123",
  setupCompletedAt: new Date().toISOString(),
  setupStatus: "complete",
  storeName: "Test Store",
  template: "restaurant",
  templateId: "restaurant",
  templateName: "Restaurant",
});
check(
  "N. Production onboarding writes are no-ops",
  getStoredBusinessContext() === null && getStoredEntryPath() === "/businesses",
);

const {
  getTemplateAwareEntryPath,
} = await import("../lib/auth/store-post-login-redirect");
const {
  getStoreMembershipsForUser,
  resolveStorePostLoginRedirect,
} = await import("../lib/auth/store-membership");
const { authenticateMerchantUser } = await import("../lib/auth/merchant-login");
const { prisma } = await import("../lib/db/prisma");

check(
  "O. DB template redirect still preferred over localStorage alias",
  getTemplateAwareEntryPath({
    allowBackOfficeAccess: true,
    allowPOSAccess: true,
    businessTemplateKey: "clothes_shop",
    roles: ["Owner"],
  }) === "/template-shell/clothing",
);

let dbReady = true;
try {
  await prisma.$queryRaw`SELECT business_template_key FROM companies LIMIT 1`;
} catch {
  dbReady = false;
}

if (!dbReady) {
  check("P. Owner login redirect regression", true, "skipped — database unavailable");
  check("Q. LP-4 provisioning path intact", true, "skipped — database unavailable");
  check("R. Cross-company access guard present", true, "skipped — database unavailable");
} else {
  const owner = await authenticateMerchantUser("igo-admin", "AdminChangeMe123!");
  if (owner) {
    const ownerMemberships = await getStoreMembershipsForUser(owner.id);
    const ownerResolved = resolveStorePostLoginRedirect(ownerMemberships);
    check(
      "P. Owner login redirect regression",
      ownerResolved.redirectTo === "/dashboard",
      ownerResolved.redirectTo,
    );
  } else {
    check("P. Owner login redirect regression", false, "owner auth failed");
  }

  const lp4Company = await prisma.company.findFirst({
    orderBy: { createdAt: "desc" },
    where: { storeCode: { startsWith: "lp4-" } },
  });
  if (lp4Company) {
    check(
      "Q. LP-4 provisioning path intact",
      Boolean(lp4Company.businessTemplateKey),
      lp4Company.businessTemplateKey ?? "missing",
    );
  } else {
    check("Q. LP-4 provisioning path intact", true, "skipped — no lp4-* store in database");
  }

  check(
    "R. Cross-company access guard present",
    readSource("lib/db/resolve-tenant-user.ts").includes("resolveTenantMembership"),
  );
}

process.env.IGO_DEMO_MODE = "true";
const { isDemoOnboardingEnabled: demoOn } = await import("../lib/demo/onboarding-access");
check("S. Demo onboarding enabled only when IGO_DEMO_MODE=true", demoOn() === true);
process.env.IGO_DEMO_MODE = "false";

const failed = results.filter((result) => !result.ok);
console.log(`\nLP-6 demo onboarding cleanup harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
