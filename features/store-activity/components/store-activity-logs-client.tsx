"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Filter, RefreshCw, X } from "lucide-react";

import type { StoreActivityLogOptions, StoreActivityLogRecord } from "@/features/store-activity/store-activity-log-service";
import { cn } from "@/lib/utils";

type StoreActivityResponse = {
  logs: StoreActivityLogRecord[];
  options: StoreActivityLogOptions;
  pagination: {
    hasNextPage: boolean;
    limit: number;
    page: number;
    total: number;
  };
};

type StoreActivityFilters = {
  action: string;
  actorId: string;
  branchId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  terminalId: string;
};

const emptyOptions: StoreActivityLogOptions = {
  actions: [],
  actors: [],
  branches: [],
  statuses: [],
  terminals: [],
};

const initialFilters: StoreActivityFilters = {
  action: "",
  actorId: "",
  branchId: "",
  dateFrom: defaultDateFrom(),
  dateTo: "",
  status: "",
  terminalId: "",
};

function defaultDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function copy(locale: "en" | "th") {
  return locale === "th"
    ? {
        accessDenied: "คุณไม่มีสิทธิ์ดูส่วนนี้",
        action: "การทำงาน",
        activityDetail: "รายละเอียดกิจกรรม",
        actor: "ผู้ใช้งาน",
        amount: "จำนวนเงิน",
        approvedBy: "อนุมัติโดย",
        approvalMethod: "วิธีอนุมัติ",
        approvalReason: "เหตุผลอนุมัติ",
        back: "กลับไป Store Activity Logs",
        before: "ก่อน",
        branch: "สาขา",
        createdAt: "วันที่ / เวลา",
        currency: "สกุลเงิน",
        dateFrom: "จากวันที่",
        dateTo: "ถึงวันที่",
        details: "รายละเอียด",
        device: "อุปกรณ์",
        empty: "ไม่พบประวัติการทำงานของร้าน",
        filters: "ตัวกรอง",
        metadata: "Metadata",
        occurredAt: "เวลาที่เกิดรายการ",
        originalAction: "รายการต้นทาง",
        refresh: "โหลดใหม่",
        requestedBy: "ร้องขอโดย",
        role: "บทบาท",
        status: "สถานะ",
        storeActivityLogs: "Store Activity Logs",
        syncedAt: "เวลาซิงก์",
        target: "เป้าหมาย",
        terminal: "เครื่อง POS",
      }
    : {
        accessDenied: "You do not have permission to view this section.",
        action: "Action",
        activityDetail: "Activity Detail",
        actor: "Actor",
        amount: "Amount",
        approvedBy: "Approved by",
        approvalMethod: "Approval method",
        approvalReason: "Approval reason",
        back: "Back to Store Activity Logs",
        before: "Before",
        branch: "Branch",
        createdAt: "Date / Time",
        currency: "Currency",
        dateFrom: "Date from",
        dateTo: "Date to",
        details: "Details",
        device: "Device",
        empty: "No store activity logs found.",
        filters: "Filters",
        metadata: "Metadata",
        occurredAt: "Occurred at",
        originalAction: "Original action",
        refresh: "Refresh",
        requestedBy: "Requested by",
        role: "Role",
        status: "Status",
        storeActivityLogs: "Store Activity Logs",
        syncedAt: "Synced at",
        target: "Target",
        terminal: "Terminal",
      };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function titleize(value: string | null | undefined) {
  const text = String(value ?? "-");
  return text.replace(/[._-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function detailValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return (
      <div className="grid gap-1">
        {value.map((item, index) => (
          <div key={index}>{detailValue(item)}</div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "-";
    return (
      <div className="grid gap-2 text-xs">
        {entries.map(([key, entry]) => (
          <div className="grid gap-1 rounded-md border border-border bg-background p-2 sm:grid-cols-[180px_minmax(0,1fr)]" key={key}>
            <span className="font-semibold text-muted-foreground">{titleize(key)}</span>
            <span className="min-w-0 break-words">{detailValue(entry)}</span>
          </div>
        ))}
      </div>
    );
  }
  return String(value);
}

function metadataValue(log: StoreActivityLogRecord, key: string) {
  const metadata = log.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  return (metadata as Record<string, unknown>)[key];
}

function metadataDisplayValue(log: StoreActivityLogRecord, key: string): React.ReactNode {
  return detailValue(metadataValue(log, key));
}

function buildQuery(filters: StoreActivityFilters, page: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set("page", String(page));
  params.set("limit", "50");
  return params.toString();
}

export function StoreActivityLogsClient({ locale = "en" }: { locale?: "en" | "th" }) {
  const c = copy(locale);
  const [filters, setFilters] = useState<StoreActivityFilters>(initialFilters);
  const [logs, setLogs] = useState<StoreActivityLogRecord[]>([]);
  const [options, setOptions] = useState<StoreActivityLogOptions>(emptyOptions);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<StoreActivityLogRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const query = useMemo(() => buildQuery(filters, page), [filters, page]);

  async function loadLogs() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/activity-logs?${query}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setLogs([]);
        setError(response.status === 403 ? c.accessDenied : payload.message ?? payload.error?.message ?? "Store activity logs could not be loaded.");
        return;
      }
      const data = payload.data as StoreActivityResponse;
      setLogs(data.logs ?? []);
      setOptions(data.options ?? emptyOptions);
      setHasNextPage(Boolean(data.pagination?.hasNextPage));
      setTotal(data.pagination?.total ?? 0);
    } catch (loadError) {
      setLogs([]);
      setError(loadError instanceof Error ? loadError.message : "Store activity logs could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, [query]);

  function updateFilter<K extends keyof StoreActivityFilters>(key: K, value: StoreActivityFilters[K]) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  if (error === c.accessDenied) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-5 text-danger">
        <h3 className="font-semibold">Access denied</h3>
        <p className="mt-2 text-sm">{c.accessDenied}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{c.storeActivityLogs}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{total} records</p>
        </div>
        <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary hover:text-primary" type="button" onClick={loadLogs}>
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} aria-hidden="true" />
          {c.refresh}
        </button>
      </div>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4 text-primary" aria-hidden="true" />
          {c.filters}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <FilterField label={c.dateFrom}><input className="field-input" type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></FilterField>
          <FilterField label={c.dateTo}><input className="field-input" type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} /></FilterField>
          <FilterField label={c.action}><select className="field-input" value={filters.action} onChange={(event) => updateFilter("action", event.target.value)}><option value="">All</option>{options.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></FilterField>
          <FilterField label={c.status}><select className="field-input" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All</option>{options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></FilterField>
          <FilterField label={c.actor}><select className="field-input" value={filters.actorId} onChange={(event) => updateFilter("actorId", event.target.value)}><option value="">All</option>{options.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></FilterField>
          <FilterField label={c.branch}><select className="field-input" value={filters.branchId} onChange={(event) => updateFilter("branchId", event.target.value)}><option value="">All</option>{options.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FilterField>
        </div>
      </section>

      {error ? <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                {[c.createdAt, c.actor, c.role, c.action, c.target, c.amount, c.currency, c.status, c.terminal, c.details].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>{isLoading ? "Loading..." : c.empty}</td></tr>
              ) : logs.map((log) => (
                <tr className="border-t border-border transition hover:bg-primary/5" key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(log.createdAt)}</td>
                  <td className="px-4 py-3">{log.actorName}</td>
                  <td className="px-4 py-3">{titleize(log.actorRole)}</td>
                  <td className="px-4 py-3"><Badge value={log.action} tone="info" /></td>
                  <td className="px-4 py-3">{log.targetName ?? log.targetType}</td>
                  <td className="px-4 py-3">{log.amount ?? "-"}</td>
                  <td className="px-4 py-3">{log.currency}</td>
                  <td className="px-4 py-3"><Badge value={log.status} tone={log.status === "denied" || log.status === "failed" ? "danger" : "success"} /></td>
                  <td className="px-4 py-3">{log.terminalName ?? log.deviceName ?? "-"}</td>
                  <td className="px-4 py-3">
                    <button className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" type="button" onClick={() => setSelected(log)}>
                      {c.details}
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button className="h-10 rounded-md border border-border px-3 font-semibold disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
        <span className="text-muted-foreground">Page {page}</span>
        <button className="h-10 rounded-md border border-border px-3 font-semibold disabled:opacity-50" disabled={!hasNextPage || isLoading} type="button" onClick={() => setPage((current) => current + 1)}>Next</button>
      </div>

      {selected ? <ActivityDetailDrawer c={c} log={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function FilterField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Badge({ tone, value }: { tone: "danger" | "info" | "success"; value: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
      tone === "danger" ? "bg-danger/10 text-danger" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
    )}>
      {value}
    </span>
  );
}

function ActivityDetailDrawer({ c, log, onClose }: { c: ReturnType<typeof copy>; log: StoreActivityLogRecord; onClose: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[60] flex w-full justify-end">
      <aside className="pointer-events-auto flex h-full w-full max-w-[calc(100vw-4rem)] flex-col border-l border-border bg-background shadow-2xl xl:max-w-[calc(100vw-17rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
          <div className="min-w-0">
            <button className="mb-2 text-sm font-semibold text-primary" type="button" onClick={onClose}>{c.back}</button>
            <h2 className="truncate text-xl font-semibold">{c.activityDetail}</h2>
          </div>
          <button className="grid size-10 shrink-0 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4">
            <DetailGrid rows={[
              [c.createdAt, formatDate(log.createdAt)],
              [c.occurredAt, formatDate(log.occurredAt)],
              [c.syncedAt, formatDate(log.syncedAt)],
              [c.actor, log.actorName],
              [c.role, titleize(log.actorRole)],
              [c.action, log.action],
              [c.status, log.status],
              [c.target, `${log.targetType}${log.targetName ? `: ${log.targetName}` : ""}`],
              [c.branch, log.branch?.name ?? log.branchId ?? "-"],
              [c.terminal, log.terminalName ?? "-"],
              [c.device, log.deviceName ?? "-"],
              [c.amount, log.amount ?? "-"],
              [c.currency, log.currency],
            ]} />
            <DetailGrid rows={[
              [c.requestedBy, metadataDisplayValue(log, "requested_by_user_name")],
              [c.approvedBy, metadataDisplayValue(log, "approved_by_user_name")],
              [c.approvalReason, metadataDisplayValue(log, "reason")],
              [c.approvalMethod, metadataDisplayValue(log, "approval_method")],
              [c.originalAction, detailValue(metadataValue(log, "attempted_action") ?? metadataValue(log, "attempted_actions") ?? log.action)],
            ]} />
            <DetailPanel title={c.before}>{detailValue(log.beforeValue)}</DetailPanel>
            <DetailPanel title="After">{detailValue(log.afterValue)}</DetailPanel>
            <DetailPanel title={c.metadata}>{detailValue(log.metadata)}</DetailPanel>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(([label, value]) => (
        <div className="min-w-0 rounded-md border border-border bg-background p-3" key={label}>
          <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
          <div className="mt-1 break-words text-sm font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}
