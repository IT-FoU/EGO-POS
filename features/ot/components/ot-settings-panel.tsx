"use client";

import { useState } from "react";
import { EmployeePicker, type EmployeePickerOption } from "@/features/settings/components/employee-picker";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";

const WEEKDAYS = [
  { value: "0", key: "weekdaySun" },
  { value: "1", key: "weekdayMon" },
  { value: "2", key: "weekdayTue" },
  { value: "3", key: "weekdayWed" },
  { value: "4", key: "weekdayThu" },
  { value: "5", key: "weekdayFri" },
  { value: "6", key: "weekdaySat" },
] as const;

function minutesToTime(total: number) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(total) || 0)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(24 * 60 - 1, hours * 60 + minutes));
}

export function OtSettingsPanel({
  employees,
  locale,
}: {
  employees: EmployeePickerOption[];
  locale: SupportedLocale;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [pending, setPending] = useState(false);

  async function post(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/staff/ot", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessage({ text: String(payload.error || tSettings("otSaveFailed", locale)), tone: "error" });
        return;
      }
      setMessage({ text: tSettings("otSaved", locale), tone: "success" });
    } catch {
      setMessage({ text: tSettings("otSaveFailed", locale), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  function saveTemplate() {
    const startMinute = timeToMinutes(startTime);
    const endMinute = timeToMinutes(endTime);
    if (endMinute <= startMinute) {
      setMessage({ text: tSettings("otTimeOrderInvalid", locale), tone: "error" });
      return;
    }
    void post({
      action: "upsert_policy",
      enabled: true,
      endMinute,
      startMinute,
      userId: userId || null,
      weekday: Number(weekday),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5" data-testid="ot-settings">
      <div>
        <h3 className="text-xl font-semibold">{tSettings("otSettingsTitle", locale)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tSettings("otSettingsHelp", locale)}</p>
      </div>

      <EmployeePicker
        allowCompanyDefault
        employees={employees}
        id="ot-employee"
        locale={locale}
        value={userId}
        onChange={setUserId}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("weekday", locale)}</span>
          <select className="field-input" value={weekday} onChange={(event) => setWeekday(event.target.value)}>
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {tSettings(day.key, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("otStartTime", locale)}</span>
          <input className="field-input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value || minutesToTime(0))} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("otEndTime", locale)}</span>
          <input className="field-input" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value || minutesToTime(0))} />
        </label>
        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={saveTemplate}
          >
            {pending ? tSettings("saving", locale) : tSettings("saveOtTemplate", locale)}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{tSettings("otNoPayrollHelp", locale)}</p>

      <a className="inline-flex text-sm font-medium text-primary underline" href="/staff/ot">
        {tSettings("openOtApprovals", locale)}
      </a>

      {message ? (
        <p className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"} role="status">
          {message.text}
        </p>
      ) : null}

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tSettings("noEmployeesFound", locale)}</p>
      ) : null}
    </div>
  );
}
