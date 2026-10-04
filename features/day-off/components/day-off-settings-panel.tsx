"use client";

import { useCallback, useEffect, useState } from "react";
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

type DayOffSnapshot = {
  companyQuotaDays: number | null;
  employeeQuotaDays: number | null;
  specialGrants: Array<{ id: string; requestDate: string; status: string }>;
  weekdays: number[];
};

function quotaText(value: number | null | undefined) {
  return value == null || Number.isNaN(Number(value)) ? "" : String(value);
}

export function DayOffSettingsPanel({
  employees,
  locale,
}: {
  employees: EmployeePickerOption[];
  locale: SupportedLocale;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState("0");
  const [quotaDays, setQuotaDays] = useState("");
  const [savedWeekdays, setSavedWeekdays] = useState<number[]>([]);
  const [specialGrants, setSpecialGrants] = useState<DayOffSnapshot["specialGrants"]>([]);
  const [usesCompanyQuota, setUsesCompanyQuota] = useState(false);
  const [specialDate, setSpecialDate] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const applySnapshot = useCallback((snapshot: DayOffSnapshot, selectedUserId: string | null) => {
    const employeeQuota = snapshot.employeeQuotaDays;
    const companyQuota = snapshot.companyQuotaDays;
    if (selectedUserId && employeeQuota != null) {
      setQuotaDays(quotaText(employeeQuota));
      setUsesCompanyQuota(false);
    } else {
      setQuotaDays(quotaText(companyQuota));
      setUsesCompanyQuota(Boolean(selectedUserId) && employeeQuota == null && companyQuota != null);
    }
    setSavedWeekdays(snapshot.weekdays);
    setSpecialGrants(snapshot.specialGrants);
    if (snapshot.weekdays.length > 0) setWeekday(String(snapshot.weekdays[0]));
  }, []);

  const loadSnapshot = useCallback(async (selectedUserId: string | null) => {
    const params = new URLSearchParams({ view: "settings" });
    if (selectedUserId) params.set("userId", selectedUserId);
    const response = await fetch(`/api/staff/day-off?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || !payload.data) {
      setMessage({ text: String(payload.error || tSettings("dayOffSaveFailed", locale)), tone: "error" });
      return;
    }
    applySnapshot(payload.data as DayOffSnapshot, selectedUserId);
  }, [applySnapshot, locale]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({ view: "settings" });
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/staff/day-off?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok || payload.ok === false || !payload.data) {
        setMessage({ text: String(payload.error || tSettings("dayOffSaveFailed", locale)), tone: "error" });
        return;
      }
      applySnapshot(payload.data as DayOffSnapshot, userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, locale, userId]);

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
      await loadSnapshot(userId);
      setMessage({ text: tSettings("dayOffSaved", locale), tone: "success" });
    } catch {
      setMessage({ text: tSettings("dayOffSaveFailed", locale), tone: "error" });
    } finally {
      setPending(false);
    }
  }

  const employeeActionsDisabled = pending || !userId;
  const savedDayLabels = savedWeekdays
    .map((day) => WEEKDAYS.find((entry) => entry.value === String(day)))
    .filter((entry): entry is (typeof WEEKDAYS)[number] => Boolean(entry))
    .map((entry) => tSettings(entry.key, locale));

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
      {userId ? null : (
        <p className="text-sm text-muted-foreground">{tSettings("companyDefaultEmployeeOnly", locale)}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("weekday", locale)}</span>
          <select className="field-input" disabled={!userId} value={weekday} onChange={(event) => setWeekday(event.target.value)}>
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {tSettings(day.key, locale)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {userId
              ? savedDayLabels.length > 0
                ? `${tSettings("savedWeeklyDays", locale)}: ${savedDayLabels.join(", ")}`
                : tSettings("noSavedWeeklyDay", locale)
              : tSettings("companyDefaultEmployeeOnly", locale)}
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={employeeActionsDisabled}
            type="button"
            onClick={() => {
              if (!userId) return;
              void post({ action: "upsert_weekly", userId, weekday: Number(weekday) });
            }}
          >
            {pending ? tSettings("saving", locale) : tSettings("setWeeklyDayOff", locale)}
          </button>
          <button
            className="h-10 rounded-md border border-danger/40 px-4 text-sm font-semibold text-danger disabled:opacity-60"
            disabled={employeeActionsDisabled}
            type="button"
            onClick={() => setConfirmRemove(true)}
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
            placeholder={tSettings("noSavedQuota", locale)}
            type="number"
            value={quotaDays}
            onChange={(event) => setQuotaDays(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {usesCompanyQuota ? tSettings("employeeQuotaFallback", locale) : quotaDays === "" ? tSettings("noSavedQuota", locale) : tSettings("monthlyQuotaHelp", locale)}
          </span>
        </label>
        <div className="flex items-end">
          <button
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() => {
              if (quotaDays.trim() === "" || !Number.isInteger(Number(quotaDays)) || Number(quotaDays) < 0) {
                setMessage({ text: tSettings("quotaRequired", locale), tone: "error" });
                return;
              }
              void post({
                action: "upsert_quota_policy",
                monthlyQuotaDays: Number(quotaDays),
                userId,
              });
            }}
          >
            {pending ? tSettings("saving", locale) : tSettings("saveQuota", locale)}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">{tSettings("specialGrantDate", locale)}</span>
          <input
            className="field-input"
            disabled={!userId}
            type="date"
            value={specialDate}
            onChange={(event) => setSpecialDate(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {userId ? tSettings("savedSpecialGrants", locale) : tSettings("companyDefaultEmployeeOnly", locale)}
          </span>
        </label>
        <div className="flex items-end">
          <button
            className="h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60"
            disabled={employeeActionsDisabled}
            type="button"
            onClick={() => {
              if (!userId) return;
              if (!specialDate) {
                setMessage({ text: tSettings("specialDateRequired", locale), tone: "error" });
                return;
              }
              void post({ action: "grant_special", requestDate: specialDate, userId });
            }}
          >
            {tSettings("grantSpecialDayOff", locale)}
          </button>
        </div>
      </div>

      {userId ? (
        specialGrants.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {specialGrants.map((grant) => (
              <li key={grant.id}>
                {grant.requestDate} · {grant.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tSettings("noSavedSpecialGrants", locale)}</p>
        )
      ) : null}

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
                  if (!userId) return;
                  void post({ action: "remove_weekly", userId, weekday: Number(weekday) });
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
