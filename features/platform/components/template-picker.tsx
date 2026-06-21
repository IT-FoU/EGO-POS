"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Coffee,
  Pill,
  ShoppingBag,
  Shirt,
  Sparkles,
  Store,
  Utensils,
  Warehouse,
} from "lucide-react";
import type { BusinessTemplateType } from "@/features/platform/platform-data";
import type { LocalizedBusinessTemplate } from "@/features/platform/platform-localization";
import {
  getStoredEntryPath,
  getStoredBusinessContext,
  saveSelectedTemplateDraft,
} from "@/features/platform/onboarding-context";

const templateIcons = {
  coffee: Coffee,
  pill: Pill,
  shopping_bag: ShoppingBag,
  shirt: Shirt,
  sparkles: Sparkles,
  store: Store,
  utensils: Utensils,
  warehouse: Warehouse,
} satisfies Record<LocalizedBusinessTemplate["icon"], React.ComponentType<{ className?: string }>>;

export function TemplatePicker({
  continueLabel,
  locale,
  noTemplateSelectedLabel,
  selectLabel,
  selectedLabel,
  templates,
}: {
  continueLabel: string;
  locale: string;
  noTemplateSelectedLabel: string;
  selectLabel: string;
  selectedLabel: string;
  templates: LocalizedBusinessTemplate[];
}) {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessTemplateType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function continueToSetup() {
    if (!selectedTemplate) {
      setError(noTemplateSelectedLabel);
      return;
    }

    const template = templates.find((item) => item.type === selectedTemplate);

    if (!template) {
      setError(noTemplateSelectedLabel);
      return;
    }

    startTransition(() => {
      const existingBusiness = getStoredBusinessContext();

      if (existingBusiness) {
        router.push(getStoredEntryPath());
        return;
      }

      saveSelectedTemplateDraft({
        businessTemplateId: template.type,
        businessType: template.type,
        defaultModules: template.enabledModuleKeys,
        locale,
        selectedAt: new Date().toISOString(),
        setupStatus: "draft",
        templateName: template.name,
      });
      router.push(`/businesses/setup?template=${template.type}`);
    });
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => {
          const Icon = templateIcons[template.icon];
          const isSelected = selectedTemplate === template.type;

          return (
            <button
              className={
                isSelected
                  ? "flex min-h-[280px] flex-col rounded-md border border-primary bg-primary/10 p-5 text-left shadow-sm"
                  : "flex min-h-[280px] flex-col rounded-md border border-border bg-card p-5 text-left transition hover:border-primary"
              }
              key={template.type}
              onClick={() => {
                setError(null);
                setSelectedTemplate(template.type);
              }}
              type="button"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-12 place-items-center rounded-md bg-background text-primary">
                  <Icon className="size-6" />
                </div>
                <span
                  className={
                    isSelected
                      ? "rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                      : "rounded-md border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {isSelected ? selectedLabel : selectLabel}
                </span>
              </div>
              <div className="mt-5 text-lg font-semibold">{template.name}</div>
              <p className="mt-3 min-h-24 text-sm leading-6 text-muted-foreground">
                {template.description}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {template.enabledModules.slice(0, 4).map((module) => (
                  <span
                    className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground"
                    key={module}
                  >
                    {module}
                  </span>
                ))}
                {template.enabledModules.length > 4 ? (
                  <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    +{template.enabledModules.length - 4}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          disabled={isPending || !selectedTemplate}
          onClick={continueToSetup}
          type="button"
        >
          {continueLabel}
          <ArrowRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
