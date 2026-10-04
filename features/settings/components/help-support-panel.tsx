"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleHelp, Copy, Info } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { APP_NAME } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import { filterHelpTopics } from "@/features/settings/help-topics";
import { SectionTitle } from "@/features/settings/components/settings-fields";
import { SupportDesk } from "@/features/support/components/support-desk";
import type { SupportTicketSummary } from "@/features/support/support-types";

export type HelpSystemContext = {
  branchName: string;
  companyName: string;
  locale: SupportedLocale;
  pagePath: string;
  userDisplayName: string;
  username: string;
};

function browserSummary() {
  if (typeof navigator === "undefined") return "";
  return [navigator.userAgent, `${window.innerWidth}x${window.innerHeight}`].filter(Boolean).join(" | ");
}

function buildCopyText(context: HelpSystemContext, includeBrowser: boolean) {
  const lines = [
    APP_NAME,
    `Company: ${context.companyName || "-"}`,
    `Branch: ${context.branchName || "-"}`,
    `User: ${context.userDisplayName || context.username || "-"}`,
    context.username && context.userDisplayName !== context.username ? `Username: ${context.username}` : "",
    `Locale: ${context.locale}`,
    `Page: ${context.pagePath}`,
    `Time: ${new Date().toISOString()}`,
    "Version: unavailable",
  ];
  if (includeBrowser) {
    lines.push(`Browser: ${browserSummary() || "-"}`);
  }
  return lines.filter(Boolean).join("\n");
}

export function HelpSupportPanel({
  canSubmit,
  context,
  locale,
  tickets,
}: {
  canSubmit: boolean;
  context: HelpSystemContext;
  locale: SupportedLocale;
  tickets: SupportTicketSummary[];
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const topics = useMemo(() => filterHelpTopics(query, locale), [query, locale]);

  async function copyText(kind: "system" | "support") {
    const text = buildCopyText(context, kind === "support");
    try {
      await navigator.clipboard.writeText(text);
      setMessage({
        text: kind === "support" ? tSettings("supportContextCopied", locale) : tSettings("systemInfoCopied", locale),
        tone: "success",
      });
    } catch {
      setMessage({ text: tSettings("clipboardCopyFailed", locale), tone: "error" });
    }
  }

  return (
    <div className="grid gap-6">
      <SupportDesk canSubmit={canSubmit} initialTickets={tickets} locale={locale} />
      {message ? (
        <div
          className={
            message.tone === "success"
              ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
          role="status"
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={CircleHelp} title={tSettings("helpCenter", locale)} />
        <p className="mt-2 text-sm text-muted-foreground">{tSettings("helpCenterHelp", locale)}</p>
        <div className="mt-4">
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="settings-help-search">
            {tSettings("searchHelp", locale)}
            <input
              className="field-input"
              id="settings-help-search"
              placeholder={tSettings("searchHelpPlaceholder", locale)}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 grid gap-3">
          {topics.length === 0 ? (
            <p className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              {tSettings("noMatchingHelp", locale)}
            </p>
          ) : (
            topics.map((topic) => (
              <article key={topic.id} className="rounded-md border border-border bg-background p-4">
                <h3 className="text-base font-semibold">{topic.title[locale]}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.body[locale]}</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-foreground">
                  {topic.steps[locale].map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {topic.hrefs.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topic.hrefs.map((item) => (
                      <Link
                        key={item.href}
                        className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-primary hover:bg-primary/5"
                        href={item.href}
                      >
                        {item.label[locale]}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Info} title={tSettings("aboutEgoPos", locale)} />
        <p className="mt-2 text-sm text-muted-foreground">{tSettings("aboutEgoPosHelp", locale)}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemAppName", locale)}</dt>
            <dd className="mt-1 text-sm font-medium">{APP_NAME}</dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemVersion", locale)}</dt>
            <dd className="mt-1 text-sm font-medium">{tSettings("versionUnavailable", locale)}</dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemCompany", locale)}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{context.companyName || "-"}</dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemBranch", locale)}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{context.branchName || "-"}</dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemUser", locale)}</dt>
            <dd className="mt-1 break-words text-sm font-medium">
              {context.userDisplayName || context.username || "-"}
              {context.username && context.userDisplayName && context.username !== context.userDisplayName
                ? ` (${context.username})`
                : ""}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemLocale", locale)}</dt>
            <dd className="mt-1 text-sm font-medium">{context.locale}</dd>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tSettings("systemPage", locale)}</dt>
            <dd className="mt-1 break-all text-sm font-medium">{context.pagePath}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="settings-motion-save inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            type="button"
            onClick={() => void copyText("system")}
          >
            <Copy aria-hidden="true" className="size-4" />
            {tSettings("copySystemInformation", locale)}
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold"
            type="button"
            onClick={() => void copyText("support")}
          >
            <Copy aria-hidden="true" className="size-4" />
            {tSettings("copySupportContext", locale)}
          </button>
        </div>
      </section>
    </div>
  );
}
