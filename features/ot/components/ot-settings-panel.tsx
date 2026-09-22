"use client";

import { useState } from "react";

export function OtSettingsPanel() {
  const [userId, setUserId] = useState("");
  const [weekday, setWeekday] = useState("1");
  const [startMinute, setStartMinute] = useState("1200");
  const [endMinute, setEndMinute] = useState("1320");
  const [message, setMessage] = useState("");

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
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4" data-testid="ot-settings">
      <div>
        <h3 className="font-semibold">OT Settings</h3>
        <p className="text-xs text-muted-foreground">Weekday OT templates (not approval). Grants: /staff/ot</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="h-9 rounded-md border border-border px-2 text-sm"
          placeholder="Employee user id (blank = company)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <select className="h-9 rounded-md border border-border px-2 text-sm" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          <option value="0">Sun</option>
          <option value="1">Mon</option>
          <option value="2">Tue</option>
          <option value="3">Wed</option>
          <option value="4">Thu</option>
          <option value="5">Fri</option>
          <option value="6">Sat</option>
        </select>
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="number" value={startMinute} onChange={(e) => setStartMinute(e.target.value)} />
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="number" value={endMinute} onChange={(e) => setEndMinute(e.target.value)} />
        <button
          className="h-9 rounded-md border border-border text-sm"
          type="button"
          onClick={() =>
            void post({
              action: "upsert_policy",
              enabled: true,
              endMinute: Number(endMinute),
              startMinute: Number(startMinute),
              userId: userId || null,
              weekday: Number(weekday),
            })
          }
        >
          Save OT Template
        </button>
      </div>
      <a className="text-sm underline" href="/staff/ot">
        Open OT Approvals
      </a>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
