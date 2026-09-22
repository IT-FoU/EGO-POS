"use client";

import { useEffect, useState } from "react";

export function OtApprovalsClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [businessDate, setBusinessDate] = useState("");
  const [startMinute, setStartMinute] = useState("1200");
  const [endMinute, setEndMinute] = useState("1320");

  async function refresh() {
    const response = await fetch("/api/staff/ot", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "Failed to load");
      return;
    }
    setRows(Array.isArray(payload.data) ? payload.data : []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/staff/ot", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      setMessage(payload.error || "Failed");
      return;
    }
    setMessage("Saved.");
    await refresh();
  }

  return (
    <div className="space-y-4 p-4" data-testid="ot-approvals">
      <div>
        <h1 className="text-xl font-semibold">OT Approvals</h1>
        <p className="text-sm text-muted-foreground">Owner/Manager direct OT grant. No employee request queue.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input className="h-9 rounded-md border border-border px-2 text-sm" placeholder="Employee user id" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="number" placeholder="Start minute" value={startMinute} onChange={(e) => setStartMinute(e.target.value)} />
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="number" placeholder="End minute" value={endMinute} onChange={(e) => setEndMinute(e.target.value)} />
        <button
          className="h-9 rounded-md border border-border text-sm"
          type="button"
          onClick={() =>
            void post({
              action: "grant",
              businessDate,
              endMinute: Number(endMinute),
              startMinute: Number(startMinute),
              userId,
            })
          }
        >
          Grant OT
        </button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
            <span>
              {row.businessDate} · {row.userId} · {row.startMinute}-{row.endMinute} · {row.status}
            </span>
            {row.status === "approved" ? (
              <button className="rounded border border-border px-2 py-1 text-xs" type="button" onClick={() => void post({ action: "cancel", approvalId: row.id })}>
                Cancel
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
