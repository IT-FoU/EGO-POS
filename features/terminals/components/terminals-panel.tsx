"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings, localizeSettingsError } from "@/lib/i18n/settings-copy";
import { AppSmallModal } from "@/components/ui/app-small-modal";
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
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [deleteTarget, setDeleteTarget] = useState<TerminalCard | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
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
      setMessage(error instanceof Error ? localizeSettingsError(error.message, locale) : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commitDelete() {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) {
      setDeleteError(tSettings("ownerPasswordRequired", locale));
      return;
    }
    setBusy(true);
    setDeleteError("");
    try {
      const next = await send(`/api/settings/terminals/${deleteTarget.id}`, "DELETE", { ownerPassword: deletePassword });
      setTerminals(next);
      setMessage(tSettings("terminalDeleted", locale));
      if (editingId === deleteTarget.id) setEditingId("");
      setDeleteTarget(null);
      setDeletePassword("");
      router.refresh();
    } catch (error) {
      setDeleteError(localizeSettingsError(error instanceof Error ? error.message : "", locale));
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
            {canEdit && editingId === terminal.id ? (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    () => send(`/api/settings/terminals/${terminal.id}`, "PATCH", { status: editStatus, terminalName: editName }),
                    tSettings("terminalUpdated", locale),
                  ).then((saved) => {
                    if (saved) setEditingId("");
                  });
                }}
              >
                <p className="text-sm text-muted-foreground">{tSettings("terminalCodeLabel", locale)}: {terminal.terminalCode}</p>
                <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={editName} onChange={(event) => setEditName(event.target.value)} />
                <div className="flex gap-2">
                  {(["ACTIVE", "DISABLED"] as const).map((status) => (
                    <button
                      className={editStatus === status
                        ? "settings-motion-tab h-10 rounded-md border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary"
                        : "settings-motion-tab h-10 rounded-md border border-border px-3 text-sm font-semibold"}
                      key={status}
                      type="button"
                      onClick={() => setEditStatus(status)}
                    >
                      {status === "ACTIVE" ? tSettings("terminalActive", locale) : tSettings("terminalDisabled", locale)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="settings-motion-save h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" disabled={busy} type="submit">{tSettings("save", locale)}</button>
                  <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" disabled={busy} type="button" onClick={() => setEditingId("")}>{tSettings("cancel", locale)}</button>
                </div>
              </form>
            ) : null}
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button className="settings-motion-tab h-10 rounded-md border border-border px-3 text-sm font-semibold" disabled={busy} type="button" onClick={() => { setEditingId(terminal.id); setEditName(terminal.terminalName); setEditStatus(terminal.status); }}>
                  {tSettings("edit", locale)}
                </button>
                <button
                  className="settings-motion-tab h-10 rounded-md border border-border px-3 text-sm font-semibold"
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
                  className="settings-motion-tab h-10 rounded-md border border-border px-3 text-sm font-semibold"
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
                    className="settings-motion-tab h-10 rounded-md border border-border px-3 text-sm font-semibold"
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
                <button
                  className="settings-motion-icon h-10 rounded-md bg-danger px-3 text-sm font-semibold text-white"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setDeleteTarget(terminal);
                    setDeletePassword("");
                    setDeleteError("");
                  }}
                >
                  {tSettings("delete", locale)}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {deleteTarget ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setDeleteTarget(null)}>{tSettings("cancel", locale)}</button>
              <button className="settings-motion-save h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="button" onClick={() => void commitDelete()}>{tSettings("delete", locale)}</button>
            </div>
          )}
          onClose={() => setDeleteTarget(null)}
          size="sm"
          title={`${tSettings("delete", locale)} ${deleteTarget.terminalCode}`}
        >
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{tSettings("terminalDeleteConfirm", locale)}</p>
            {deleteError ? <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{deleteError}</p> : null}
            <label className="grid gap-1 text-sm font-medium" htmlFor="terminal-delete-owner-password">
              {tSettings("ownerPassword", locale)}
              <input
                autoComplete="current-password"
                className="field-input"
                id="terminal-delete-owner-password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
          </div>
        </AppSmallModal>
      ) : null}
    </section>
  );
}
