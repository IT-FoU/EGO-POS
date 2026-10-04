"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tPos as t } from "@/lib/i18n/pos-copy";
import type { PosCurrentTerminal, TerminalCard } from "@/features/terminals/terminal-types";

export function PosTerminalChip({ terminal }: { terminal: PosCurrentTerminal | null }) {
  const router = useRouter();
  const [choices, setChoices] = useState<TerminalCard[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/pos/terminal")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || payload.ok === false) return;
        setChoices(Array.isArray(payload.data?.terminals) ? payload.data.terminals : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [terminal?.id, terminal?.status]);

  async function bind(choice: TerminalCard) {
    const rebind = Boolean(terminal) || (choice.terminalBound && !choice.isCurrentDevice);
    if (rebind && !window.confirm(t("ui.terminal.rebind.confirm"))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pos/terminal", {
        body: JSON.stringify({ rebind, terminalId: choice.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(String(payload.message || payload.error || t("ui.terminal.bind.required")));
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("ui.terminal.bind.required"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 grid gap-2">
      <p className="truncate text-xs font-semibold text-muted-foreground">
        {terminal ? `${terminal.terminalCode} · ${terminal.terminalName}` : t("ui.terminal.bind.required")}
        {terminal?.status === "DISABLED" ? ` · ${t("ui.terminal.disabled")}` : ""}
      </p>
      {!terminal || terminal.status === "DISABLED" ? (
        <div className="flex flex-wrap gap-2">
          {choices.filter((choice) => choice.status === "ACTIVE").map((choice) => (
            <button
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold"
              disabled={busy}
              key={choice.id}
              type="button"
              onClick={() => void bind(choice)}
            >
              {choice.terminalBound && !choice.isCurrentDevice ? t("ui.terminal.rebind") : t("ui.terminal.bind")} {choice.terminalCode}
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p className="text-xs text-danger">{message}</p> : null}
    </div>
  );
}
