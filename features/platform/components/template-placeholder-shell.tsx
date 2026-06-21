"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { getStoredBusinessContext } from "@/features/platform/onboarding-context";
import {
  formatPlatformMessage,
  type LocalizedBusinessTemplate,
} from "@/features/platform/platform-localization";
import type { platformEn } from "@/locales/en/platform";

type TemplatePlaceholderMessages = typeof platformEn.templatePlaceholder;
type PlatformMessages = Pick<typeof platformEn, "appName" | "slogan">;

export function TemplatePlaceholderShell({
  messages,
  platform,
  template,
}: {
  messages: TemplatePlaceholderMessages;
  platform: PlatformMessages;
  template: LocalizedBusinessTemplate;
}) {
  const [storeName, setStoreName] = useState("Your Business");

  useEffect(() => {
    const business = getStoredBusinessContext();
    setStoreName(business?.storeName || "Your Business");
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
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
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground"
            href="/dashboard"
          >
            {messages.dashboardLink}
          </Link>
        </header>
        <section className="rounded-md border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-14 place-items-center rounded-md bg-background text-primary">
              <Store className="size-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">{template.name} POS</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">{storeName}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {formatPlatformMessage(messages.description, { templateName: template.name })}
              </p>
            </div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {messages.statusCards.map(
            (label) => (
              <div className="rounded-md border border-border bg-card p-5" key={label}>
                <div className="text-sm font-semibold">{label}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {formatPlatformMessage(messages.permanent, { templateName: template.name })}
                </p>
              </div>
            ),
          )}
        </section>
        <Link
          className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          href="/businesses/setup"
        >
          {messages.reviewSetup}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </main>
  );
}
