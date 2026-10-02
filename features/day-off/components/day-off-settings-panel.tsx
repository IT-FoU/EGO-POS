"use client";

import { useState } from "react";
import { AppSmallModal } from "@/components/ui/app-small-modal";
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

export function DayOffSettingsPanel({
  employees,
  locale,
}: {
  employees: EmployeePickerOption[];
  locale: SupportedLocale;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState("0");
  const [quotaDays, setQuotaDays] = useState("2");
  const [specialDate, setSpecialDate] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function post(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/staff/day-off", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setMessage({ text: String(payload.error || tSettings("dayOffSaveFailed", locale)), tone: "error" });
        return;
      }
      setMessage({ text: tSettings("dayOffSaved", locale), tone: "success" });
    } catch {
      setMessage({ text: tSettings("dayOffSaveFailed", locale), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  function requireEmployee(): string | null {
    if (!userId) {
      setMessage({ text: tSettings("employeeRequired", locale), tone: "error" });
      return null;
    }
    return userId;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5" data-testid="day-off-settings">
      <div>
        <h3 className="text-xl font-semibold">{tSettings("dayOffSettingsTitle", locale)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tSettings("dayOffSettingsHelp", locale)}</p>
      </div>

      <EmployeePicker
        allowCompanyDefault
        employees={employees}
        id="day-off-employee"
        locale={locale}
        value={userId}
        onChange={setUserId}
      />

      <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="flex flex-wrap items-end gap-2">
          <button
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() => {
              const selected = requireEmployee();
              if (!selected) return;
              void post({ action: "upsert_weekly", userId: selected, weekday: Number(weekday) });
            }}
          >
            {tSettings("setWeeklyDayOff", locale)}
          </button>
          <button
            className="h-10 rounded-md border border-danger/40 px-4 text-sm font-semibold text-danger disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() => {
              if (!requireEmployee()) return;
              setConfirmRemove(true);
            }}
          >
            {tSettings("removeWeeklyDayOff", locale)}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("monthlyQuotaDays", locale)}</span>
          <input
            className="field-input"
            min={0}
            type="number"
            value={quotaDays}
            onChange={(event) => setQuotaDays(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">{tSettings("monthlyQuotaHelp", locale)}</span>
        </label>
        <div className="flex items-end">
          <button
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() =>
              void post({
                action: "upsert_quota_policy",
                monthlyQuotaDays: Number(quotaDays),
                userId: userId || null,
              })
            }
          >
            {tSettings("saveQuota", locale)}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("specialGrantDate", locale)}</span>
          <input
            className="field-input"
            type="date"
            value={specialDate}
            onChange={(event) => setSpecialDate(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button
            className="h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() => {
              const selected = requireEmployee();
              if (!selected) return;
              if (!specialDate) {
                setMessage({ text: tSettings("specialDateRequired", locale), tone: "error" });
                return;
              }
              void post({ action: "grant_special", requestDate: specialDate, userId: selected });
            }}
          >
            {tSettings("grantSpecialDayOff", locale)}
          </button>
        </div>
      </div>

      <a className="inline-flex text-sm font-medium text-primary underline" href="/staff/day-off">
        {tSettings("openDayOffApprovals", locale)}
      </a>

      {message ? (
        <p className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"} role="status">
          {message.text}
        </p>
      ) : null}

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tSettings("noEmployeesFound", locale)}</p>
      ) : null}

      {confirmRemove ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setConfirmRemove(false)}>
                {tSettings("cancel", locale)}
              </button>
              <button
                className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white"
                type="button"
                onClick={() => {
                  setConfirmRemove(false);
                  const selected = requireEmployee();
                  if (!selected) return;
                  void post({ action: "remove_weekly", userId: selected, weekday: Number(weekday) });
                }}
              >
                {tSettings("removeWeeklyDayOff", locale)}
              </button>
            </div>
          }
          onClose={() => setConfirmRemove(false)}
          size="sm"
          title={tSettings("removeWeeklyDayOffTitle", locale)}
        >
          <p className="text-sm text-muted-foreground">{tSettings("removeWeeklyDayOffConfirm", locale)}</p>
        </AppSmallModal>
      ) : null}
    </div>
  );
}
