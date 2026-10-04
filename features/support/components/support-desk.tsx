"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, MessageSquare, Bug, Lightbulb, History } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import {
  createSupportTicketAction,
  getSupportTicketAction,
  replySupportTicketAction,
} from "@/features/support/actions";
import type { SupportTicketDetail, SupportTicketSummary } from "@/features/support/support-types";
import { SectionTitle } from "@/features/settings/components/settings-fields";

const CATEGORIES = ["POS", "PRODUCTS", "INVENTORY", "PURCHASING", "CUSTOMERS", "MEMBERSHIP", "REPORTS", "SETTINGS", "PERFORMANCE", "PRINTING", "OTHER"] as const;

type View = "home" | "chat" | "problem" | "feature" | "history" | "thread";

function statusLabel(status: string, locale: SupportedLocale) {
  const key = {
    CLOSED: "statusClosed",
    COMPLETED: "statusCompleted",
    DECLINED: "statusDeclined",
    IN_PROGRESS: "statusInProgress",
    OPEN: "statusOpen",
    PLANNED: "statusPlanned",
    RESOLVED: "statusResolved",
    REVIEWING: "statusReviewing",
    SUBMITTED: "statusSubmitted",
    WAITING_STORE: "waitingForStore",
    WAITING_SUPPORT: "waitingForSupport",
  }[status];
  return key ? tSettings(key, locale) : status;
}

function typeLabel(type: string, locale: SupportedLocale) {
  if (type === "CHAT") return tSettings("chatToSuperAdmin", locale);
  if (type === "PROBLEM") return tSettings("reportProblem", locale);
  return tSettings("featureRequest", locale);
}

function categoryLabel(category: string, locale: SupportedLocale) {
  const key = `supportCategory${category.charAt(0)}${category.slice(1).toLowerCase()}`;
  const label = tSettings(key, locale);
  return label === key ? category : label;
}

export function SupportDesk({
  canSubmit,
  initialTickets,
  locale,
}: {
  canSubmit: boolean;
  initialTickets: SupportTicketSummary[];
  locale: SupportedLocale;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [tickets, setTickets] = useState(initialTickets);
  const [thread, setThread] = useState<SupportTicketDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = useMemo(
    () => tickets.filter((ticket) => (typeFilter === "all" || ticket.type === typeFilter) && (statusFilter === "all" || ticket.status === statusFilter)),
    [statusFilter, tickets, typeFilter],
  );

  function context() {
    return {
      appVersion: "",
      browserSummary: typeof navigator === "undefined" ? "" : `${navigator.userAgent} | ${window.innerWidth}x${window.innerHeight}`,
      sourcePath: typeof window === "undefined" ? "/settings/help" : window.location.pathname,
    };
  }

  function openThread(ticketId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await getSupportTicketAction(ticketId);
      if (!result.ok || !result.data) {
        setMessage({ text: result.error || tSettings("supportSendFailed", locale), tone: "error" });
        return;
      }
      const detail = result.data as SupportTicketDetail;
      setThread(detail);
      setTickets((current) => current.map((ticket) => (ticket.id === detail.id ? { ...ticket, storeUnread: false, status: detail.status } : ticket)));
      setView("thread");
    });
  }

  function submit(input: Record<string, unknown>) {
    setMessage(null);
    startTransition(async () => {
      const result = await createSupportTicketAction({ ...context(), ...input });
      if (!result.ok || !result.data) {
        setMessage({ text: result.error || tSettings("supportSendFailed", locale), tone: "error" });
        return;
      }
      const detail = result.data as SupportTicketDetail;
      setTickets((current) => [detail, ...current.filter((ticket) => ticket.id !== detail.id)]);
      setThread(detail);
      setView("thread");
      setMessage({ text: tSettings("supportSent", locale), tone: "success" });
      router.refresh();
    });
  }

  function reply(form: FormData) {
    if (!thread) return;
    const text = String(form.get("message") ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await replySupportTicketAction(thread.id, { message: text, senderSide: "SUPER_ADMIN" });
      if (!result.ok || !result.data) {
        setMessage({ text: result.error || tSettings("supportSendFailed", locale), tone: "error" });
        return;
      }
      const detail = result.data as SupportTicketDetail;
      setThread(detail);
      setTickets((current) => current.map((ticket) => (ticket.id === detail.id ? { ...ticket, ...detail } : ticket)));
      setMessage({ text: tSettings("supportReplySent", locale), tone: "success" });
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5" data-support-desk>
      <SectionTitle icon={LifeBuoy} title={tSettings("helpAndSupport", locale)} />
      <p className="mt-2 text-sm text-muted-foreground">{tSettings("supportHomeHelp", locale)}</p>
      {message ? (
        <p className={message.tone === "success" ? "mt-4 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success" : "mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"} role="status">
          {message.text}
        </p>
      ) : null}

      {view === "home" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SupportCard icon={MessageSquare} label={tSettings("chatToSuperAdmin", locale)} onClick={() => setView("chat")} />
          <SupportCard icon={Bug} label={tSettings("reportProblem", locale)} onClick={() => setView("problem")} />
          <SupportCard icon={Lightbulb} label={tSettings("featureRequest", locale)} onClick={() => setView("feature")} />
          <SupportCard icon={History} label={tSettings("myRequests", locale)} onClick={() => setView("history")} />
        </div>
      ) : null}

      {view === "chat" ? (
        <SupportForm
          locale={locale}
          pending={pending || !canSubmit}
          title={tSettings("chatToSuperAdmin", locale)}
          onBack={() => setView("home")}
          onSubmit={(form) => submit({ message: form.get("message"), subject: form.get("subject") || tSettings("chatToSuperAdmin", locale), type: "CHAT" })}
        >
          <TextField label={tSettings("supportSubject", locale)} name="subject" required defaultValue={tSettings("chatToSuperAdmin", locale)} />
          <TextArea label={tSettings("supportMessage", locale)} name="message" required />
        </SupportForm>
      ) : null}

      {view === "problem" ? (
        <SupportForm locale={locale} pending={pending || !canSubmit} title={tSettings("reportProblem", locale)} onBack={() => setView("home")} onSubmit={(form) => submit({ affectedArea: form.get("area"), category: form.get("category"), message: form.get("message"), subject: form.get("subject"), type: "PROBLEM" })}>
          <TextField label={tSettings("supportSubject", locale)} name="subject" required />
          <CategoryField locale={locale} />
          <TextField label={tSettings("supportAffectedArea", locale)} name="area" />
          <TextArea label={tSettings("supportDescription", locale)} name="message" required />
        </SupportForm>
      ) : null}

      {view === "feature" ? (
        <SupportForm locale={locale} pending={pending || !canSubmit} title={tSettings("featureRequest", locale)} onBack={() => setView("home")} onSubmit={(form) => submit({ category: form.get("category"), message: form.get("message"), subject: form.get("subject"), type: "FEATURE_REQUEST", why: form.get("why") })}>
          <TextField label={tSettings("supportSubject", locale)} name="subject" required />
          <CategoryField locale={locale} />
          <TextArea label={tSettings("supportDescription", locale)} name="message" required />
          <TextArea label={tSettings("supportWhy", locale)} name="why" required />
        </SupportForm>
      ) : null}

      {view === "history" ? (
        <div className="mt-4 grid gap-3">
          <button className="w-fit text-sm font-semibold text-primary" type="button" onClick={() => setView("home")}>{tSettings("backToSupport", locale)}</button>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              {tSettings("ticketType", locale)}
              <select className="field-input mt-1" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">{tSettings("filterAll", locale)}</option>
                <option value="CHAT">{tSettings("chatToSuperAdmin", locale)}</option>
                <option value="PROBLEM">{tSettings("reportProblem", locale)}</option>
                <option value="FEATURE_REQUEST">{tSettings("featureRequest", locale)}</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              {tSettings("ticketStatus", locale)}
              <select className="field-input mt-1" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">{tSettings("filterAll", locale)}</option>
                {["OPEN", "WAITING_SUPPORT", "WAITING_STORE", "RESOLVED", "CLOSED", "SUBMITTED", "REVIEWING", "PLANNED", "IN_PROGRESS", "COMPLETED", "DECLINED"].map((status) => (
                  <option key={status} value={status}>{statusLabel(status, locale)}</option>
                ))}
              </select>
            </label>
          </div>
          {visible.length === 0 ? <p className="text-sm text-muted-foreground">{tSettings("noSupportRequests", locale)}</p> : visible.map((ticket) => (
            <button className="rounded-md border border-border bg-background p-4 text-left" data-support-ticket={ticket.id} key={ticket.id} type="button" onClick={() => openThread(ticket.id)}>
              <span className="flex flex-wrap items-center gap-2">
                <strong>{ticket.subject}</strong>
                {ticket.storeUnread ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{tSettings("unreadReply", locale)}</span> : null}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{typeLabel(ticket.type, locale)} · {statusLabel(ticket.status, locale)} · {new Date(ticket.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      ) : null}

      {view === "thread" && thread ? (
        <div className="mt-4 grid gap-3" data-support-thread={thread.id}>
          <button className="w-fit text-sm font-semibold text-primary" type="button" onClick={() => setView("history")}>{tSettings("myRequests", locale)}</button>
          <div>
            <h3 className="text-lg font-semibold">{thread.subject}</h3>
            <p className="text-sm text-muted-foreground">{typeLabel(thread.type, locale)} · {statusLabel(thread.status, locale)}</p>
          </div>
          <div className="grid gap-2">
            {thread.messages.map((item) => (
              <article className={item.senderSide === "SUPER_ADMIN" ? "rounded-md border border-primary/30 bg-primary/5 p-3" : "rounded-md border border-border bg-background p-3"} data-sender={item.senderSide} key={item.id}>
                <p className="text-xs font-semibold text-muted-foreground">{item.senderSide === "SUPER_ADMIN" ? tSettings("superAdminMessage", locale) : tSettings("storeMessage", locale)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p>
              </article>
            ))}
          </div>
          {thread.type !== "FEATURE_REQUEST" && (thread.status === "RESOLVED" || thread.status === "CLOSED") ? (
            <p className="text-sm text-muted-foreground">{tSettings("reopenHint", locale)}</p>
          ) : null}
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); reply(new FormData(event.currentTarget)); event.currentTarget.reset(); }}>
            <TextArea label={tSettings("supportMessage", locale)} name="message" required />
            <button className="inline-flex h-11 w-fit items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={pending || !canSubmit} type="submit">
              {tSettings("sendMessage", locale)}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function SupportCard({ icon: Icon, label, onClick }: { icon: typeof LifeBuoy; label: string; onClick: () => void }) {
  return (
    <button className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-4 text-left text-sm font-semibold hover:bg-primary/5" type="button" onClick={onClick}>
      <Icon aria-hidden="true" className="size-4 text-primary" />
      {label}
    </button>
  );
}

function SupportForm({ children, locale, onBack, onSubmit, pending, title }: { children: ReactNode; locale: SupportedLocale; onBack: () => void; onSubmit: (form: FormData) => void; pending: boolean; title: string }) {
  return (
    <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}>
      <button className="w-fit text-sm font-semibold text-primary" type="button" onClick={onBack}>{tSettings("backToSupport", locale)}</button>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
      <p className="text-xs text-muted-foreground">{tSettings("supportContextHelp", locale)}</p>
      <button className="inline-flex h-11 w-fit items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
        {tSettings("submitRequest", locale)}
      </button>
    </form>
  );
}

function TextField({ defaultValue, label, name, required }: { defaultValue?: string; label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input className="field-input" defaultValue={defaultValue} name={name} required={required} />
    </label>
  );
}

function TextArea({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <textarea className="field-input min-h-24" name={name} required={required} />
    </label>
  );
}

function CategoryField({ locale }: { locale: SupportedLocale }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {tSettings("supportCategory", locale)}
      <select className="field-input" name="category" defaultValue="OTHER">
        {CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category, locale)}</option>)}
      </select>
    </label>
  );
}
