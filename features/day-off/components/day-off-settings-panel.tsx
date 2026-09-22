"use client";

import { useState } from "react";

export function DayOffSettingsPanel() {
  const [userId, setUserId] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [quotaDays, setQuotaDays] = useState("2");
  const [specialDate, setSpecialDate] = useState("");
  const [message, setMessage] = useState("");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/staff/day-off", {
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
    <div className="space-y-3 rounded-md border border-border p-4" data-testid="day-off-settings">
      <div>
        <h3 className="font-semibold">Day Off Settings</h3>
        <p className="text-xs text-muted-foreground">Weekly Day Off, monthly quota, Special grant. Approvals: /staff/day-off</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="h-9 rounded-md border border-border px-2 text-sm" placeholder="Employee user id" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <select className="h-9 rounded-md border border-border px-2 text-sm" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          <option value="0">Sun</option>
          <option value="1">Mon</option>
          <option value="2">Tue</option>
          <option value="3">Wed</option>
          <option value="4">Thu</option>
          <option value="5">Fri</option>
          <option value="6">Sat</option>
        </select>
        <button className="h-9 rounded-md border border-border text-sm" type="button" onClick={() => void post({ action: "upsert_weekly", userId, weekday: Number(weekday) })}>
          Set Weekly Day Off
        </button>
        <button className="h-9 rounded-md border border-border text-sm" type="button" onClick={() => void post({ action: "remove_weekly", userId, weekday: Number(weekday) })}>
          Remove Weekly Day Off
        </button>
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="number" min={0} value={quotaDays} onChange={(e) => setQuotaDays(e.target.value)} />
        <button className="h-9 rounded-md border border-border text-sm" type="button" onClick={() => void post({ action: "upsert_quota_policy", userId: userId || null, monthlyQuotaDays: Number(quotaDays) })}>
          Save Quota (blank user = company default)
        </button>
        <input className="h-9 rounded-md border border-border px-2 text-sm" type="date" value={specialDate} onChange={(e) => setSpecialDate(e.target.value)} />
        <button className="h-9 rounded-md border border-border text-sm" type="button" onClick={() => void post({ action: "grant_special", userId, requestDate: specialDate })}>
          Grant Special Day Off
        </button>
      </div>
      <a className="text-sm underline" href="/staff/day-off">
        Open Day Off Approvals
      </a>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
