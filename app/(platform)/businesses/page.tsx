import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { resolveStorePostLoginRedirectForUser } from "@/lib/auth/store-membership";
import { isDemoMode } from "@/lib/demo-mode";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { TemplatePicker } from "@/features/platform/components/template-picker";
import { OnboardingEntryRedirect } from "@/features/platform/components/onboarding-entry-redirect";
import { CompanyMembershipPicker } from "@/features/platform/components/company-membership-picker";
import {
  getLocalizedBusinessTemplates,
  getPlatformMessages,
} from "@/features/platform/platform-localization";
import { getStoreMembershipsForUser } from "@/lib/auth/store-membership";

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const dictionary = getDictionary(session.user.locale);
  const platform = getPlatformMessages(session.user.locale);
  const templates = getLocalizedBusinessTemplates(session.user.locale);
  const memberships = await getStoreMembershipsForUser(session.user.id);
  const demoMode = isDemoMode();

  if (!demoMode) {
    if (memberships.length === 0) {
      return (
        <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
          <div className="mx-auto grid w-full max-w-3xl gap-6">
            <h1 className="text-3xl font-semibold">{dictionary.noCompanyAssignmentTitle}</h1>
            <p className="text-sm text-muted-foreground">{dictionary.noCompanyAssignmentDescription}</p>
          </div>
        </main>
      );
    }

    if (memberships.length === 1 && params?.status !== "picker") {
      const resolved = await resolveStorePostLoginRedirectForUser(session.user.id);
      redirect(resolved.redirectTo);
    }

    return (
      <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
        <div className="mx-auto grid w-full max-w-3xl gap-8">
          <section>
            <p className="text-sm font-semibold text-primary">{platform.platformEyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold">{dictionary.chooseCompanyTitle}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{dictionary.chooseCompanyDescription}</p>
          </section>
          <CompanyMembershipPicker
            companies={memberships.map((membership) => ({
              businessTemplateKey: membership.businessTemplateKey,
              companyId: membership.companyId,
              companyName: membership.companyName,
              roleNames: membership.roleNames,
              storeCode: membership.storeCode,
            }))}
            openLabel={dictionary.openBusiness}
            submittingLabel={dictionary.signingIn}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <OnboardingEntryRedirect enabled />
      <div className="mx-auto grid w-full max-w-6xl gap-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
              I
            </div>
            <div>
              <div className="text-lg font-semibold">{platform.appName}</div>
              <div className="text-xs text-muted-foreground">{platform.slogan}</div>
            </div>
          </div>
        </header>
        <section className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">{platform.platformEyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">
            {dictionary.chooseBusinessTemplate}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {dictionary.chooseBusinessTemplateDescription}
          </p>
        </section>
        <TemplatePicker
          continueLabel={dictionary.continueToBusinessSetup}
          locale={session.user.locale ?? "lo"}
          noTemplateSelectedLabel={platform.selectTemplateError}
          selectLabel={dictionary.select}
          selectedLabel={dictionary.selected}
          templates={templates}
        />
      </div>
    </main>
  );
}
