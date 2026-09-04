"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudOff, Cloud, RefreshCw, X } from "lucide-react";
import { useConnectivity } from "@/features/offline/pwa/use-connectivity";
import { getOfflineFeatureFlag } from "@/features/offline/feature-flags";
import type { StoreNamespace } from "@/features/offline/types";
import { canManageStoreSettings } from "@/features/permissions/store-ui-permissions";

interface OfflineStatusIndicatorProps {
  companyId: string | null;
  branchId: string | null;
  terminalId: string | null;
  roles: string[] | string | null;
}

interface DiagnosticsView {
  pending: number;
  syncing: number;
  needsAttention: number;
  total: number;
  lastSyncCursor: string | null;
  error?: string;
}

function resolveNamespace(props: OfflineStatusIndicatorProps): StoreNamespace | null {
  if (!props.companyId || !props.branchId || !props.terminalId) return null;
  return {
    companyId: props.companyId,
    branchId: props.branchId,
    terminalId: props.terminalId,
  };
}

export function OfflineStatusIndicator(props: OfflineStatusIndicatorProps) {
  const connectivity = useConnectivity();
  const online = connectivity.state === "online";
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsView | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { companyId, branchId, terminalId, roles } = props;
  // Memoize by primitive identity so effects/callbacks don't loop each render.
  const namespace = useMemo(
    () => resolveNamespace({ companyId, branchId, terminalId, roles: null }),
    [companyId, branchId, terminalId],
  );
  const writeEnabled = useMemo(
    () => getOfflineFeatureFlag(namespace ?? undefined).writeEnabled,
    [namespace],
  );
  const flag = { writeEnabled };
  const canManage = canManageStoreSettings(roles);

  const loadDiagnostics = useCallback(async () => {
    if (!namespace || !writeEnabled) {
      // Diagnostics without a live offline DB: report a safe empty snapshot.
      setDiagnostics({
        pending: 0,
        syncing: 0,
        needsAttention: 0,
        total: 0,
        lastSyncCursor: null,
      });
      return;
    }
    try {
      const [{ OfflineDatabase }, { IndexedDbOfflineBackend, isIndexedDbAvailable }, { collectOfflineDiagnostics }] =
        await Promise.all([
          import("@/features/offline/local-db/database"),
          import("@/features/offline/local-db/indexeddb-backend"),
          import("@/features/offline/diagnostics"),
        ]);
      if (!isIndexedDbAvailable()) {
        setDiagnostics({
          pending: 0,
          syncing: 0,
          needsAttention: 0,
          total: 0,
          lastSyncCursor: null,
          error: "IndexedDB unavailable in this browser mode",
        });
        return;
      }
      const db = await OfflineDatabase.open({
        namespace,
        backend: new IndexedDbOfflineBackend(),
      });
      const snapshot = await collectOfflineDiagnostics(db);
      db.close();
      setDiagnostics({
        pending: snapshot.counts.pending,
        syncing: snapshot.counts.syncing,
        needsAttention: snapshot.needsAttention,
        total: snapshot.counts.total,
        lastSyncCursor: snapshot.lastSyncCursor,
      });
    } catch (error) {
      setDiagnostics({
        pending: 0,
        syncing: 0,
        needsAttention: 0,
        total: 0,
        lastSyncCursor: null,
        error: error instanceof Error ? error.message : "Diagnostics unavailable",
      });
    }
  }, [namespace, writeEnabled]);

  useEffect(() => {
    if (open) void loadDiagnostics();
  }, [open, loadDiagnostics]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const runSyncNow = useCallback(async () => {
    setSyncMessage(null);
    const { NoopSyncCoordinator } = await import("@/features/offline/sync/sync-coordinator");
    const result = await new NoopSyncCoordinator().sync("manual");
    setSyncMessage(
      result.ok
        ? "Sync complete."
        : "Sync engine is not enabled yet (arrives in a later phase).",
    );
  }, []);

  const pending = diagnostics?.pending ?? 0;
  const needsAttention = diagnostics?.needsAttention ?? 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={online ? "Connection status: online" : "Connection status: offline"}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
          online
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
            : "border-amber-500/40 bg-amber-500/10 text-amber-600"
        }`}
      >
        {online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        <span>{online ? "Online" : "Offline"}</span>
        {pending > 0 ? (
          <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-700">
            {pending}
          </span>
        ) : null}
        {needsAttention > 0 ? (
          <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] font-semibold text-red-600">
            !
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-background p-3 text-sm shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Sync Center</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="space-y-1.5 text-xs">
            <Row label="Connection" value={online ? "Online" : "Offline"} />
            <Row
              label="Offline mode"
              value={flag.writeEnabled ? "Enabled" : "Disabled (default)"}
            />
            {canManage ? (
              <>
                <Row label="Queued" value={String(pending)} />
                <Row label="Syncing" value={String(diagnostics?.syncing ?? 0)} />
                <Row label="Needs attention" value={String(needsAttention)} />
                <Row
                  label="Last sync"
                  value={diagnostics?.lastSyncCursor ? "synced" : "—"}
                />
                {diagnostics?.error ? (
                  <p className="pt-1 text-[11px] text-amber-600">{diagnostics.error}</p>
                ) : null}
              </>
            ) : (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Ask an owner or manager for sync details.
              </p>
            )}
          </dl>

          {canManage ? (
            <div className="mt-3 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => void runSyncNow()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync now
              </button>
              {syncMessage ? (
                <p className="mt-2 text-[11px] text-muted-foreground">{syncMessage}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
