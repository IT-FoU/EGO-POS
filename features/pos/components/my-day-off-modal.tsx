"use client";

import { useEffect, useState } from "react";

type Quota = {
  monthKey: string;
  quotaDays: number | null;
  remaining: number | null;
  snapshotExists: boolean;
  used: number;
};

type RequestRow = {
  id: string;
  kind: string;
  requestDate: string;
  status: string;
  reason: string | null;
};

export function MyDayOffPanel() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [weekly, setWeekly] = useState<number[]>([]);
  const [requestDate, setRequestDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/pos/day-off");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "Could not load Day Off.");
      return;
    }
    setQuota(payload.data.quota);
    setRequests(payload.data.requests);
    setWeekly(payload.data.weeklyWeekdays || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRequest() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pos/day-off", {
        body: JSON.stringify({ requestDate, reason }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "Request failed.");
        return;
      }
      setRequestDate("");
      setReason("");
      setMessage("Request submitted.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending(requestId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pos/day-off", {
        body: JSON.stringify({ action: "cancel", requestId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessage(payload.error || "Cancel failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-1 text-sm" data-testid="my-day-off">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
        <div>Month: {quota?.monthKey ?? "—"}</div>
        <div>Weekly: {weekly.length ? weekly.join(", ") : "—"}</div>
        <div>
          Quota:{" "}
          {quota?.snapshotExists
            ? quota.quotaDays
            : quota
              ? `(policy view) ${quota.used + (quota.remaining ?? 0)}`
              : "—"}
        </div>
        <div>Used: {quota?.used ?? 0}</div>
        <div>Remaining: {quota?.remaining ?? "—"}</div>
        <div className="text-xs text-muted-foreground">View does not create month snapshot</div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="font-semibold">Request Day Off</div>
        <input
          className="h-9 w-full rounded-md border border-border bg-background px-2"
          data-testid="day-off-request-date"
          type="date"
          value={requestDate}
          onChange={(event) => setRequestDate(event.target.value)}
        />
        <input
          className="h-9 w-full rounded-md border border-border bg-background px-2"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button
          className="h-9 w-full rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          data-testid="day-off-submit"
          disabled={busy || !requestDate}
          type="button"
          onClick={() => void submitRequest()}
        >
          Submit request
        </button>
      </div>

      <div className="space-y-2">
        <div className="font-semibold">History</div>
        {requests.length === 0 ? <p className="text-muted-foreground">No requests.</p> : null}
        {requests.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-2">
            <div>
              <div>
                {row.requestDate} · {row.kind} · {row.status}
              </div>
              {row.reason ? <div className="text-xs text-muted-foreground">{row.reason}</div> : null}
            </div>
            {row.status === "pending" ? (
              <button
                className="rounded-md border border-border px-2 py-1 text-xs"
                data-testid={`day-off-cancel-${row.id}`}
                disabled={busy}
                type="button"
                onClick={() => void cancelPending(row.id)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
