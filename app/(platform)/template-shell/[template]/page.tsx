import { notFound, redirect } from "next/navigation";
import { TemplatePlaceholderShell } from "@/features/platform/components/template-placeholder-shell";
import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo-mode";
import {
  getLocalizedBusinessTemplate,
  getPlatformMessages,
} from "@/features/platform/platform-localization";

export default async function TemplateShellPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const [{ template: templateType }, session] = await Promise.all([params, requireSession()]);
  const template = getLocalizedBusinessTemplate(templateType, session.user.locale);
  const platform = getPlatformMessages(session.user.locale);

  if (template.type !== templateType) {
    notFound();
  }

  if (template.type === "mini_mart") {
    redirect("/dashboard");
  }

  return (
    <TemplatePlaceholderShell
      demoMode={isDemoMode()}
      messages={platform.templatePlaceholder}
      platform={platform}
      storeName={session.user.activeCompanyName ?? "Your Business"}
      template={template}
    />
  );
}
