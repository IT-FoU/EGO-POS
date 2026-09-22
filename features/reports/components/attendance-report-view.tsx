"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import { formatNumber } from "@/features/reports/format";
import { ReportDetailHeader, ReportPageChrome, ReportSheet } from "@/features/reports/components/report-page-shell";
import { findReportCenterEntry } from "@/features/reports/report-center-catalog";
import { REPORT_CENTER_ICON_MAP } from "@/features/reports/report-center-icons";
import { formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import { formatScheduleClock } from "@/features/attendance/attendance-qa-display";
import { formatHoursMinutes } from "@/features/reports/attendance-report-math";
import {
  attendanceReportExportHref,
  attendanceReportTableHref,
} from "@/features/reports/attendance-report-query";
import type { AttendanceReportTableResult } from "@/features/reports/attendance-report-repository";
import type { AttendanceDayRow } from "@/features/reports/attendance-report-math";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass = `h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 ${focusRing}`;
const numClass = "text-right tabular-nums";
const gridTable = "w-full border-separate border-spacing-0 text-sm text-zinc-900";
const thCell =
  "border border-zinc-300 bg-zinc-100 px-2.5 py-2 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-700";
const tdCell = "border border-zinc-300 bg-white px-2.5 py-1.5 align-middle text-zinc-900 group-hover:bg-zinc-50";
const tdTotal =
  "border border-zinc-300 border-t-2 border-t-zinc-500 bg-zinc-100 px-2.5 py-2 align-middle font-semibold text-zinc-900";

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function clock(iso: string | null) {
  if (!iso) return "—";
  return formatBusinessTimeLabel(iso);
}

function lateLabel(minutes: number, locale: SupportedLocale, hasWork: boolean) {
  if (!hasWork) return "—";
  if (minutes <= 0) return t("onTime", locale);
  return fillReportsCopy(t("minutesShort", locale), { n: minutes });
}

function dayOffLabel(label: string, locale: SupportedLocale) {
  if (label === "weekly") return t("weeklyDayOff", locale);
  if (label === "quota") return t("quotaDayOff", locale);
  if (label === "special") return t("specialDayOff", locale);
  if (label === "worked_on_day_off") return t("workedOnDayOff", locale);
  return "—";
}

function workStatusLabel(status: string, locale: SupportedLocale) {
  if (status === "worked") return t("workStatusWorked", locale);
  if (status === "open") return t("statusOpen", locale);
  if (status === "day_off") return t("dayOff", locale);
  if (status === "no_work_record") return t("noWorkRecord", locale);
  return status;
}

function hoursLabel(minutes: number | null, locale: SupportedLocale) {
  if (minutes == null) return t("notRecorded", locale);
  return formatHoursMinutes(minutes);
}

function ReportFrame({
  children,
  error,
  locale,
}: {
  children?: ReactNode;
  error?: string;
  locale: SupportedLocale;
}) {
  const entry = findReportCenterEntry("staff-attendance");
  if (!entry) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ReportPageChrome entry={entry} locale={locale} />
      <ReportDetailHeader
        descriptionKey={entry.descriptionKey}
        icon={REPORT_CENTER_ICON_MAP[entry.icon]}
        locale={locale}
        titleKey={entry.titleKey}
      />
      {error ? (
        <ReportSheet>
          <p className="py-8 text-center text-sm text-zinc-600">{t("errorAttendanceReport", locale)}</p>
        </ReportSheet>
      ) : (
        children
      )}
    </div>
  );
}

function DetailDrawer({
  businessDate,
  locale,
  onClose,
  userId,
}: {
  businessDate: string;
  locale: SupportedLocale;
  onClose: () => void;
  userId: string;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const qs = new URLSearchParams({ businessDate, userId });
    fetch(`/api/reports/staff/attendance/detail?${qs.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error("load");
        if (!cancelled) {
          setDetail(payload.data);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [businessDate, userId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-zinc-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("attendanceDetail", locale)}</h2>
          <button
            aria-label={t("close", locale)}
            className={`inline-flex size-10 items-center justify-center rounded-md ${focusRing}`}
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state === "loading" ? <p>{t("loadingAttendanceReport", locale)}</p> : null}
          {state === "error" ? <p>{t("errorAttendanceReport", locale)}</p> : null}
          {state === "ready" && detail ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <p>
                  <span className="text-zinc-500">{t("employee", locale)}:</span> {detail.employeeName}
                </p>
                <p>
                  <span className="text-zinc-500">{t("colDate", locale)}:</span> {detail.businessDate}
                </p>
                <p>
                  <span className="text-zinc-500">{t("branch", locale)}:</span> {detail.branchName}
                </p>
                <p>
                  <span className="text-zinc-500">{t("scheduledStart", locale)}:</span>{" "}
                  {detail.scheduledStart || "—"}
                  <span className="ml-2 text-xs text-zinc-400">({t("scheduleWeekdayResolved", locale)})</span>
                </p>
                <p>
                  <span className="text-zinc-500">{t("scheduledEnd", locale)}:</span>{" "}
                  {detail.scheduledEnd || "—"}
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t("attendanceSessions", locale)}</h3>
                {(detail.sessions as any[])?.length ? (
                  <table className={gridTable}>
                    <thead>
                      <tr>
                        <th className={thCell}>{t("startWork", locale)}</th>
                        <th className={thCell}>{t("endWork", locale)}</th>
                        <th className={thCell}>{t("late", locale)}</th>
                        <th className={thCell}>{t("regularHours", locale)}</th>
                        <th className={thCell}>{t("otHours", locale)}</th>
                        <th className={thCell}>{t("endSource", locale)}</th>
                        <th className={thCell}>{t("cashSession", locale)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.sessions as any[]).map((session) => (
                        <tr key={session.attendanceId}>
                          <td className={tdCell}>{clock(session.startedAt)}</td>
                          <td className={tdCell}>
                            {session.status === "open" ? t("statusOpen", locale) : clock(session.endedAt)}
                          </td>
                          <td className={tdCell}>{lateLabel(session.lateMinutes, locale, true)}</td>
                          <td className={tdCell}>{hoursLabel(session.regularMinutes, locale)}</td>
                          <td className={tdCell}>{hoursLabel(session.otMinutes, locale)}</td>
                          <td className={tdCell}>
                            {session.endSource === "auto_schedule"
                              ? t("autoSchedule", locale)
                              : session.endSource === "auto_ot"
                                ? t("autoOt", locale)
                                : session.endSource === "manual"
                                  ? t("manualEnd", locale)
                                  : "—"}
                          </td>
                          <td className={tdCell}>
                            {session.cashSessionId ? (
                              <Link
                                className="underline-offset-2 hover:underline"
                                href={`/reports/shifts/cash-counts?q=${encodeURIComponent(session.cashSessionId)}`}
                              >
                                {session.cashSessionId.slice(0, 10)}…
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-zinc-500">{t("noWorkRecord", locale)}</p>
                )}
              </div>
              {detail.dayOffRequest ? (
                <div className="grid gap-1">
                  <h3 className="font-semibold">{t("dayOff", locale)}</h3>
                  <p>
                    {detail.dayOffRequest.kind} — {detail.dayOffRequest.status}
                  </p>
                  {detail.dayOffRequest.reason ? <p>{detail.dayOffRequest.reason}</p> : null}
                </div>
              ) : null}
              {(detail.otApprovals as any[])?.length ? (
                <div className="grid gap-1">
                  <h3 className="font-semibold">{t("otApproval", locale)}</h3>
                  {(detail.otApprovals as any[]).map((ot) => (
                    <p key={ot.id}>
                      {ot.status}: {formatScheduleClock(ot.startMinute)}–{formatScheduleClock(ot.endMinute)}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DayRowCells({
  index,
  locale,
  page,
  pageSize,
  row,
}: {
  index: number;
  locale: SupportedLocale;
  page: number;
  pageSize: number;
  row: AttendanceDayRow;
}) {
  const hasWork = row.workStatus === "worked" || row.workStatus === "open";
  return (
    <>
      <td className={`${tdCell} ${numClass}`}>{(page - 1) * pageSize + index + 1}</td>
      <td className={tdCell}>{row.businessDate}</td>
      <td className={tdCell}>{row.employeeName}</td>
      <td className={tdCell}>{row.branchName}</td>
      <td className={tdCell}>{row.scheduledStart || "—"}</td>
      <td className={tdCell}>{row.scheduledEnd || "—"}</td>
      <td className={tdCell}>{clock(row.startedAt)}</td>
      <td className={tdCell}>
        {row.workStatus === "open" ? t("statusOpen", locale) : clock(row.endedAt)}
      </td>
      <td className={`${tdCell} ${numClass}`}>
        {row.workStatus === "open" ? t("statusOpen", locale) : hoursLabel(row.regularMinutes, locale)}
      </td>
      <td className={`${tdCell} ${numClass}`}>
        {row.workStatus === "open" ? t("statusOpen", locale) : hoursLabel(row.otMinutes, locale)}
      </td>
      <td className={tdCell}>{lateLabel(row.lateMinutes, locale, hasWork)}</td>
      <td className={tdCell}>{dayOffLabel(row.dayOffLabel, locale)}</td>
      <td className={tdCell}>{row.autoEnd ? t("yes", locale) : t("no", locale)}</td>
      <td className={tdCell}>{workStatusLabel(row.workStatus, locale)}</td>
      <td className={tdCell}>{row.note || "—"}</td>
    </>
  );
}

export function StaffAttendanceReportView(props: {
  data?: AttendanceReportTableResult;
  error?: string;
  locale: SupportedLocale;
}) {
  const locale = useAppLocale(props.locale);
  const data = props.data;
  const query = data?.query;
  const pathname = "/reports/staff/attendance";
  const [selected, setSelected] = useState<{ businessDate: string; userId: string } | null>(null);

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { key: "employees", label: t("summaryEmployees", locale), value: formatNumber(data.summary.employees) },
      { key: "workDays", label: t("summaryWorkDays", locale), value: formatNumber(data.summary.workDays) },
      { key: "dayOff", label: t("summaryDayOffDays", locale), value: formatNumber(data.summary.dayOffDays) },
      {
        key: "workedOnDayOff",
        label: t("workedOnDayOff", locale),
        value: formatNumber(data.summary.workedOnDayOffDays),
      },
      {
        key: "regular",
        label: t("regularHours", locale),
        value: formatHoursMinutes(data.summary.regularHoursMinutes),
      },
      { key: "ot", label: t("otHours", locale), value: formatHoursMinutes(data.summary.otHoursMinutes) },
      { key: "lateDays", label: t("lateDays", locale), value: formatNumber(data.summary.lateDays) },
      {
        key: "lateMin",
        label: t("totalLateMinutes", locale),
        value: formatNumber(data.summary.totalLateMinutes),
      },
      { key: "autoEnd", label: t("autoEndCount", locale), value: formatNumber(data.summary.autoEndCount) },
      { key: "open", label: t("openAttendance", locale), value: formatNumber(data.summary.openSessions) },
    ];
  }, [data, locale]);

  const view = query?.view ?? "daily";

  return (
    <ReportFrame error={props.error} locale={locale}>
      {data && query ? (
        <>
          <ReportSheet>
            <form className="flex flex-col gap-3" method="get">
              <input name="view" type="hidden" value={view} />
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-preset">
                  {t("dateRange", locale)}
                  <select className={fieldClass} defaultValue={query.datePreset} id="att-preset" name="datePreset">
                    <option value="today">{t("today", locale)}</option>
                    <option value="yesterday">{t("yesterday", locale)}</option>
                    <option value="this_week">{t("thisWeek", locale)}</option>
                    <option value="this_month">{t("thisMonth", locale)}</option>
                    <option value="custom">{t("custom", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-from">
                  {t("from", locale)}
                  <input
                    className={fieldClass}
                    defaultValue={query.dateFrom ? String(query.dateFrom).slice(0, 10) : ""}
                    id="att-from"
                    name="dateFrom"
                    type="date"
                  />
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-to">
                  {t("to", locale)}
                  <input
                    className={fieldClass}
                    defaultValue={query.dateTo ? String(query.dateTo).slice(0, 10) : ""}
                    id="att-to"
                    name="dateTo"
                    type="date"
                  />
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-branch">
                  {t("branch", locale)}
                  <select className={fieldClass} defaultValue={query.branchId ?? ""} id="att-branch" name="branchId">
                    <option value="">{t("allBranches", locale)}</option>
                    {data.filterOptions.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-employee">
                  {t("employee", locale)}
                  <select className={fieldClass} defaultValue={query.employeeId ?? ""} id="att-employee" name="employeeId">
                    <option value="">{t("allEmployees", locale)}</option>
                    {data.filterOptions.cashiers.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-work">
                  {t("workStatus", locale)}
                  <select className={fieldClass} defaultValue={query.workStatus} id="att-work" name="workStatus">
                    <option value="all">{t("allStatuses", locale)}</option>
                    <option value="worked">{t("workStatusWorked", locale)}</option>
                    <option value="open">{t("statusOpen", locale)}</option>
                    <option value="day_off">{t("dayOff", locale)}</option>
                    <option value="no_work_record">{t("noWorkRecord", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-dayoff">
                  {t("dayOff", locale)}
                  <select className={fieldClass} defaultValue={query.dayOffStatus} id="att-dayoff" name="dayOffStatus">
                    <option value="all">{t("allStatuses", locale)}</option>
                    <option value="none">—</option>
                    <option value="weekly">{t("weeklyDayOff", locale)}</option>
                    <option value="quota">{t("quotaDayOff", locale)}</option>
                    <option value="special">{t("specialDayOff", locale)}</option>
                    <option value="worked_on_day_off">{t("workedOnDayOff", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-late">
                  {t("late", locale)}
                  <select className={fieldClass} defaultValue={query.lateStatus} id="att-late" name="lateStatus">
                    <option value="all">{t("allStatuses", locale)}</option>
                    <option value="late">{t("late", locale)}</option>
                    <option value="on_time">{t("onTime", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-end">
                  {t("endSource", locale)}
                  <select className={fieldClass} defaultValue={query.endSource} id="att-end" name="endSource">
                    <option value="all">{t("allStatuses", locale)}</option>
                    <option value="manual">{t("manualEnd", locale)}</option>
                    <option value="auto_schedule">{t("autoSchedule", locale)}</option>
                    <option value="auto_ot">{t("autoOt", locale)}</option>
                    <option value="none">—</option>
                  </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-ot">
                  {t("otHours", locale)}
                  <select className={fieldClass} defaultValue={query.otStatus} id="att-ot" name="otStatus">
                    <option value="all">{t("allStatuses", locale)}</option>
                    <option value="has_ot">{t("hasOt", locale)}</option>
                    <option value="no_ot">{t("noOt", locale)}</option>
                    <option value="not_recorded">{t("notRecorded", locale)}</option>
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-600" htmlFor="att-q">
                  {t("searchEmployee", locale)}
                  <input className={fieldClass} defaultValue={query.employeeQuery ?? ""} id="att-q" name="q" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={`h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white ${focusRing}`} type="submit">
                  {t("apply", locale)}
                </button>
                <Link className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`} href={pathname}>
                  {t("clear", locale)}
                </Link>
                <Link
                  className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`}
                  href={attendanceReportExportHref("/api/reports/staff/attendance/export", query)}
                >
                  {t("exportExcel", locale)}
                </Link>
                <Link
                  className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`}
                  href={attendanceReportTableHref(pathname, query, { page: 1, view: "daily" })}
                >
                  {t("staffAttendance", locale)}
                </Link>
                <Link
                  className={`inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm ${focusRing}`}
                  href={attendanceReportTableHref(pathname, query, { page: 1, view: "employee_summary" })}
                >
                  {t("employeeSummary", locale)}
                </Link>
              </div>
              {data.scheduleNote === "weekday_resolved" ? (
                <p className="text-xs text-zinc-500">{t("scheduleWeekdayResolvedHint", locale)}</p>
              ) : null}
            </form>
          </ReportSheet>

          <ReportSheet>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {summaryItems.map((item) => (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2" key={item.key}>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.label}</div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-zinc-900">{item.value}</div>
                </div>
              ))}
            </div>

            {view === "employee_summary" ? (
              <div className="overflow-x-auto">
                <table className={gridTable}>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className={thCell}>{t("employee", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("trackedDays", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("summaryWorkDays", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("dayOffUsed", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("dayOffRemaining", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("workedOnDayOff", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("regularHours", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("otHours", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("lateDays", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("totalLateMinutes", locale)}</th>
                      <th className={`${thCell} ${numClass}`}>{t("autoEndCount", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employeeSummaries.length === 0 ? (
                      <tr>
                        <td className={tdCell} colSpan={11}>
                          <p className="py-6 text-center text-sm text-zinc-600">{t("emptyAttendanceReport", locale)}</p>
                        </td>
                      </tr>
                    ) : (
                      data.employeeSummaries.map((row) => (
                        <tr key={row.userId}>
                          <td className={tdCell}>{row.employeeName}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.trackedDays}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.workDays}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.dayOffUsed ?? "—"}</td>
                          <td className={`${tdCell} ${numClass}`}>
                            {row.quotaSnapshotExists ? (row.dayOffRemaining ?? "—") : t("noQuotaActivity", locale)}
                          </td>
                          <td className={`${tdCell} ${numClass}`}>{row.workedOnDayOffDays}</td>
                          <td className={`${tdCell} ${numClass}`}>{formatHoursMinutes(row.regularMinutes)}</td>
                          <td className={`${tdCell} ${numClass}`}>{formatHoursMinutes(row.otMinutes)}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.lateDays}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.lateMinutes}</td>
                          <td className={`${tdCell} ${numClass}`}>{row.autoEndCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className={gridTable}>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className={thCell}>{t("colNo", locale)}</th>
                        <th className={thCell}>{t("colDate", locale)}</th>
                        <th className={thCell}>{t("employee", locale)}</th>
                        <th className={thCell}>{t("branch", locale)}</th>
                        <th className={thCell}>{t("scheduledStart", locale)}</th>
                        <th className={thCell}>{t("scheduledEnd", locale)}</th>
                        <th className={thCell}>{t("startWork", locale)}</th>
                        <th className={thCell}>{t("endWork", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("regularHours", locale)}</th>
                        <th className={`${thCell} ${numClass}`}>{t("otHours", locale)}</th>
                        <th className={thCell}>{t("late", locale)}</th>
                        <th className={thCell}>{t("dayOff", locale)}</th>
                        <th className={thCell}>{t("autoEnd", locale)}</th>
                        <th className={thCell}>{t("workStatus", locale)}</th>
                        <th className={thCell}>{t("note", locale)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.length === 0 ? (
                        <tr>
                          <td className={tdCell} colSpan={15}>
                            <p className="py-6 text-center text-sm text-zinc-600">{t("emptyAttendanceReport", locale)}</p>
                          </td>
                        </tr>
                      ) : (
                        data.rows.map((row, index) => (
                          <tr
                            className="group cursor-pointer"
                            key={`${row.userId}-${row.businessDate}`}
                            onClick={() => setSelected({ businessDate: row.businessDate, userId: row.userId })}
                          >
                            <DayRowCells
                              index={index}
                              locale={locale}
                              page={data.page}
                              pageSize={data.pageSize}
                              row={row}
                            />
                          </tr>
                        ))
                      )}
                      {data.rows.length > 0 ? (
                        <tr>
                          <td className={tdTotal} colSpan={8}>
                            {t("total", locale)} ({formatNumber(data.totalRowCount)})
                          </td>
                          <td className={`${tdTotal} ${numClass}`}>
                            {formatHoursMinutes(data.summary.regularHoursMinutes)}
                          </td>
                          <td className={`${tdTotal} ${numClass}`}>
                            {formatHoursMinutes(data.summary.otHoursMinutes)}
                          </td>
                          <td className={`${tdTotal} ${numClass}`}>{data.summary.totalLateMinutes}</td>
                          <td className={`${tdTotal} ${numClass}`}>{data.summary.dayOffDays}</td>
                          <td className={`${tdTotal} ${numClass}`}>{data.summary.autoEndCount}</td>
                          <td className={tdTotal} colSpan={2} />
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {data.pageCount > 1 ? (
                  <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
                    <span>
                      {fillReportsCopy(t("pageOf", locale), { page: data.page, pages: data.pageCount })}
                    </span>
                    <div className="flex gap-2">
                      {data.page > 1 ? (
                        <Link
                          className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`}
                          href={attendanceReportTableHref(pathname, query, { page: data.page - 1 })}
                        >
                          {t("previous", locale)}
                        </Link>
                      ) : null}
                      {data.page < data.pageCount ? (
                        <Link
                          className={`rounded-md border border-zinc-300 px-3 py-1 ${focusRing}`}
                          href={attendanceReportTableHref(pathname, query, { page: data.page + 1 })}
                        >
                          {t("next", locale)}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </ReportSheet>

          {selected ? (
            <DetailDrawer
              businessDate={selected.businessDate}
              locale={locale}
              onClose={() => setSelected(null)}
              userId={selected.userId}
            />
          ) : null}
        </>
      ) : null}
    </ReportFrame>
  );
}
