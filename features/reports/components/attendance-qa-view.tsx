"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceQaRow, AttendanceQaSummary } from "@/features/attendance/attendance-qa-display";
import { summarizeAttendanceQa } from "@/features/attendance/attendance-qa-display";
import { formatBusinessDateTimeLabel } from "@/lib/datetime/business-timezone";
import { fillReportsCopy, tReports } from "@/lib/i18n/reports-copy";
import type { SupportedLocale } from "@/lib/constants";

const th = "border border-slate-300 bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-700";
const td = "border border-slate-200 px-2 py-2 text-xs text-slate-900";

function dash(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function scheduleLabel(source: AttendanceQaRow["scheduleSource"], locale: SupportedLocale) {
  if (source === "employee_override") return tReports("employeeOverride", locale);
  if (source === "company_default") return tReports("companyDefault", locale);
  return tReports("noSchedule", locale);
}

function regularLabel(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

export function AttendanceQaView({
  branches,
  employees,
  filters,
  locale,
  rows,
}: {
  branches: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
  filters: { branchId?: string; date?: string; status?: string; userId?: string };
  locale: SupportedLocale;
  rows: AttendanceQaRow[];
}) {
  const router = useRouter();
  const summary: AttendanceQaSummary = summarizeAttendanceQa(rows);
  const [selected, setSelected] = useState<AttendanceQaRow | null>(null);

  function apply(form: FormData) {
    const params = new URLSearchParams();
    for (const key of ["date", "userId", "branchId", "status"] as const) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    router.push(`/reports/staff/attendance-qa?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-white p-4 text-slate-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{tReports("attendanceQaTitle", locale)}</h1>
          <p className="text-sm text-slate-600">{tReports("attendanceQaSubtitle", locale)}</p>
        </div>
        <a className="text-sm font-medium text-slate-700 underline" href="/reports">
          {tReports("back", locale)}
        </a>
      </div>

      <form
        className="mb-4 grid gap-2 sm:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          apply(new FormData(event.currentTarget));
        }}
      >
        <label className="text-xs">
          {tReports("date", locale)}
          <input className="mt-1 w-full border border-slate-300 px-2 py-1" defaultValue={filters.date ?? ""} name="date" type="date" />
        </label>
        <label className="text-xs">
          {tReports("employee", locale)}
          <select className="mt-1 w-full border border-slate-300 px-2 py-1" defaultValue={filters.userId ?? ""} name="userId">
            <option value="">{tReports("allEmployees", locale)}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {tReports("branch", locale)}
          <select className="mt-1 w-full border border-slate-300 px-2 py-1" defaultValue={filters.branchId ?? ""} name="branchId">
            <option value="">{tReports("allBranches", locale)}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {tReports("status", locale)}
          <select className="mt-1 w-full border border-slate-300 px-2 py-1" defaultValue={filters.status ?? ""} name="status">
            <option value="">{tReports("allStatuses", locale)}</option>
            <option value="open">{tReports("statusOpen", locale)}</option>
            <option value="closed">{tReports("statusClosed", locale)}</option>
          </select>
        </label>
        <button className="self-end border border-slate-400 bg-white px-3 py-1 text-sm" type="submit">
          {tReports("apply", locale)}
        </button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["openAttendance", summary.openAttendance],
          ["closedAttendance", summary.closedAttendance],
          ["lateSessions", summary.lateSessions],
          ["totalLateMinutes", summary.totalLateMinutes],
        ].map(([key, value]) => (
          <div className="border border-slate-300 bg-white p-2" key={String(key)}>
            <div className="text-[11px] text-slate-500">{tReports(String(key), locale)}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] border-collapse bg-white">
          <thead>
            <tr>
              {[
                "date",
                "employee",
                "branch",
                "cashSession",
                "scheduledStart",
                "scheduledEnd",
                "startWork",
                "endWork",
                "late",
                "regularHours",
                "status",
                "endSource",
                "scheduleSource",
              ].map((key) => (
                <th className={th} key={key}>{tReports(key, locale)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={td} colSpan={13}>{tReports("emptyAttendanceQa", locale)}</td>
              </tr>
            ) : rows.map((row) => (
              <tr className="cursor-pointer hover:bg-slate-50" key={row.attendanceId} onClick={() => setSelected(row)}>
                <td className={td}>{row.businessDate}</td>
                <td className={td}>{row.employeeName}</td>
                <td className={td}>{row.branchName}</td>
                <td className={td}>{dash(row.cashSessionId)}</td>
                <td className={td}>{dash(row.scheduledStart)}</td>
                <td className={td}>{dash(row.scheduledEnd)}</td>
                <td className={td}>{formatBusinessDateTimeLabel(row.startedAt)}</td>
                <td className={td}>{row.endedAt ? formatBusinessDateTimeLabel(row.endedAt) : "—"}</td>
                <td className={td}>{fillReportsCopy(tReports("minutesShort", locale), { n: row.lateMinutes })}</td>
                <td className={td}>{regularLabel(row.regularMinutes)}</td>
                <td className={td}>{row.status === "open" ? tReports("statusOpen", locale) : tReports("statusClosed", locale)}</td>
                <td className={td}>{dash(row.endSource)}</td>
                <td className={td}>{scheduleLabel(row.scheduleSource, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-md overflow-auto bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{tReports("attendanceQaTitle", locale)}</h2>
              <button className="border border-slate-300 px-2 py-1 text-sm" type="button" onClick={() => setSelected(null)}>
                {tReports("close", locale)}
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ["attendanceId", selected.attendanceId],
                ["user", selected.employeeName],
                ["company", selected.companyId],
                ["branch", selected.branchName],
                ["businessDate", selected.businessDate],
                ["startedAt", formatBusinessDateTimeLabel(selected.startedAt)],
                ["endedAt", selected.endedAt ? formatBusinessDateTimeLabel(selected.endedAt) : "—"],
                ["lateMinutes", String(selected.lateMinutes)],
                ["regularMinutes", selected.regularMinutes == null ? "—" : String(selected.regularMinutes)],
                ["status", selected.status === "open" ? tReports("statusOpen", locale) : tReports("statusClosed", locale)],
                ["endSource", dash(selected.endSource)],
                ["cashSession", dash(selected.cashSessionId)],
                ["scheduleSource", scheduleLabel(selected.scheduleSource, locale)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{tReports(label, locale)}</dt>
                  <dd className="break-all font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
