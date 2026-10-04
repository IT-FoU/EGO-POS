"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { TerminalCard } from "@/features/terminals/terminal-types";

function formatSeen(value: string | null, locale: SupportedLocale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function send(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.message || payload.error || "Request failed."));
  }
  return payload.data as TerminalCard[];
}

export function TerminalsPanel({
  canEdit,
  initialTerminals,
  locale,
}: {
  canEdit: boolean;
  initialTerminals: TerminalCard[];
  locale: SupportedLocale;
}) {
  const router = useRouter();
  const [terminals, setTerminals] = useState(initialTerminals);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<TerminalCard[]>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      setTerminals(await task());
      setMessage(success);
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4">
      {message ? <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm">{message}</p> : null}
      {canEdit ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => send("/api/settings/terminals", "POST", { terminalName: name }),
              tSettings("terminalAdded", locale),
            ).then((saved) => {
              if (saved) setName("");
            });
          }}
        >
          <input
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            placeholder={tSettings("terminalName", locale)}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={busy || !name.trim()} type="submit">
            {tSettings("addTerminal", locale)}
          </button>
        </form>
      ) : null}
      {terminals.length === 0 ? <p className="text-sm text-muted-foreground">{tSettings("noTerminals", locale)}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {terminals.map((terminal) => (
          <article className="grid gap-3 rounded-lg border border-border bg-card p-4" key={terminal.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-muted-foreground">{terminal.terminalCode}</p>
                <h2 className="truncate text-lg font-semibold">{terminal.terminalName}</h2>
              </div>
              <span className={terminal.status === "ACTIVE" ? "rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success" : "rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"}>
                {terminal.status === "ACTIVE" ? tSettings("terminalActive", locale) : tSettings("terminalDisabled", locale)}
              </span>
            </div>
            <dl className="grid gap-1 text-sm text-muted-foreground">
              <div>{tSettings("terminalDevice", locale)}: {terminal.isCurrentDevice ? tSettings("terminalThisDevice", locale) : terminal.terminalBound ? tSettings("terminalBound", locale) : tSettings("terminalNotBound", locale)}</div>
              <div>{tSettings("terminalLastSeen", locale)}: {formatSeen(terminal.lastSeenAt, locale)}</div>
              <div>{tSettings("terminalCurrentShift", locale)}: {terminal.currentShift ? tSettings("terminalOpenShift", locale) : tSettings("terminalNoShift", locale)}</div>
            </dl>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {editingId === terminal.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () => send(`/api/settings/terminals/${terminal.id}`, "PATCH", { terminalName: editName }),
                        tSettings("terminalUpdated", locale),
                      ).then((saved) => {
                        if (saved) setEditingId("");
                      });
                    }}
                  >
                    <input className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" value={editName} onChange={(event) => setEditName(event.target.value)} />
                    <button className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" disabled={busy} type="submit">{tSettings("save", locale)}</button>
                  </form>
                ) : (
                  <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" disabled={busy} type="button" onClick={() => { setEditingId(terminal.id); setEditName(terminal.terminalName); }}>
                    {tSettings("renameTerminal", locale)}
                  </button>
                )}
                <button
                  className="h-10 rounded-md border border-border px-3 text-sm font-semibold"
                  disabled={busy}
                  type="button"
                  onClick={() => void run(
                    () => send(`/api/settings/terminals/${terminal.id}`, "PATCH", { status: terminal.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
                    tSettings("terminalUpdated", locale),
                  )}
                >
                  {terminal.status === "ACTIVE" ? tSettings("disableTerminal", locale) : tSettings("enableTerminal", locale)}
                </button>
                <button
                  className="h-10 rounded-md border border-border px-3 text-sm font-semibold"
                  disabled={busy || terminal.status !== "ACTIVE"}
                  type="button"
                  onClick={() => {
                    const deviceElsewhere = terminals.some((item) => item.isCurrentDevice && item.id !== terminal.id);
                    const rebind = deviceElsewhere || (terminal.terminalBound && !terminal.isCurrentDevice);
                    if (rebind && !window.confirm(tSettings("terminalRebindConfirm", locale))) return;
                    void run(
                      () => send(`/api/settings/terminals/${terminal.id}/bind`, "POST", { rebind }),
                      tSettings("terminalUpdated", locale),
                    );
                  }}
                >
                  {terminal.isCurrentDevice ? tSettings("terminalBound", locale) : terminal.terminalBound ? tSettings("terminalRebind", locale) : tSettings("terminalBind", locale)}
                </button>
                {terminal.terminalBound ? (
                  <button
                    className="h-10 rounded-md border border-border px-3 text-sm font-semibold"
                    disabled={busy}
                    type="button"
                    onClick={() => void run(
                      () => send(`/api/settings/terminals/${terminal.id}/bind`, "POST", { action: "unbind" }),
                      tSettings("terminalUpdated", locale),
                    )}
                  >
                    {tSettings("terminalUnbind", locale)}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
