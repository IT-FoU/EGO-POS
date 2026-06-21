import { requireSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { TemplatePicker } from "@/features/platform/components/template-picker";
import { OnboardingEntryRedirect } from "@/features/platform/components/onboarding-entry-redirect";
import {
  getLocalizedBusinessTemplates,
  getPlatformMessages,
} from "@/features/platform/platform-localization";

export default async function BusinessesPage() {
  const session = await requireSession();
  const dictionary = getDictionary(session.user.locale);
  const platform = getPlatformMessages(session.user.locale);
  const templates = getLocalizedBusinessTemplates(session.user.locale);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <OnboardingEntryRedirect />
      <div className="mx-auto grid w-full max-w-6xl gap-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
              I
            </div>
            <div>
              <div className="text-lg font-semibold">{platform.appName}</div>
              <div className="text-xs text-muted-foreground">
                {platform.slogan}
              </div>
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
