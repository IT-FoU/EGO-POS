import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo-mode";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { BusinessSetupForm } from "@/features/platform/components/business-setup-form";
import { OnboardingEntryRedirect } from "@/features/platform/components/onboarding-entry-redirect";
import {
  getLocalizedBusinessTemplate,
  getPlatformMessages,
} from "@/features/platform/platform-localization";

export default async function BusinessSetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string }>;
}) {
  const [params, session] = await Promise.all([searchParams, requireSession()]);
  const dictionary = getDictionary(session.user.locale);
  const platform = getPlatformMessages(session.user.locale);
  const template = getLocalizedBusinessTemplate(params?.template, session.user.locale);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <OnboardingEntryRedirect enabled={isDemoMode()} />
      <div className="mx-auto grid w-full max-w-4xl gap-6">
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
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            href="/businesses"
          >
            <ArrowLeft className="size-4" />
            {dictionary.backToTemplates}
          </Link>
        </div>
        <section className="rounded-md border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-md bg-background text-primary">
              <Store className="size-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">{template.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">
                {dictionary.businessSetup}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {dictionary.fastSetupDescription}
              </p>
            </div>
          </div>
        </section>
        <BusinessSetupForm
          dictionary={dictionary}
          setupSaveError={platform.setupSaveError}
          template={template}
        />
      </div>
    </main>
  );
}
