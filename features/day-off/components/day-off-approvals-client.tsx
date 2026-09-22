"use client";

import { useEffect, useState } from "react";

type RequestRow = {
  id: string;
  kind: string;
  requestDate: string;
  status: string;
  userId: string;
  reason: string | null;
};

export function DayOffApprovalsClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/staff/day-off");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "Could not load pending requests.");
      return;
    }
    setRows(payload.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(action: string, requestId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/day-off", {
        body: JSON.stringify({ action, requestId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "Action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="day-off-approvals">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
          <div>
            <div>
              {row.requestDate} · {row.kind} · user {row.userId.slice(0, 8)}
            </div>
            {row.reason ? <div className="text-xs text-muted-foreground">{row.reason}</div> : null}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1"
              disabled={busy}
              type="button"
              onClick={() => void act("approve", row.id)}
            >
              Approve
            </button>
            <button
              className="rounded-md border border-border px-3 py-1"
              disabled={busy}
              type="button"
              onClick={() => void act("reject", row.id)}
            >
              Reject
            </button>
            <button
              className="rounded-md border border-border px-3 py-1"
              disabled={busy}
              type="button"
              onClick={() => void act("cancel", row.id)}
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      <p className="text-xs text-muted-foreground">
        Settings: use Staff Day Off API actions for weekly/quota (`/api/staff/day-off`). Approvals hub:{" "}
        <a className="underline" href="/staff/day-off">
          /staff/day-off
        </a>
      </p>
    </div>
  );
}
