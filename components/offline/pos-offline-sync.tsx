"use client";

import { useEffect, useMemo } from "react";
import { getOfflineFeatureFlag } from "@/features/offline/feature-flags";
import { getOrCreateDeviceId } from "@/features/offline/device-identity";
import type { StoreNamespace } from "@/features/offline/types";
import { getConnectivityStore } from "@/features/offline/pwa/connectivity";
import { getPosOfflineStatusStore } from "@/features/offline/pos-read/pos-offline-status-store";
import { evaluatePosOfflineGate } from "@/features/offline/pos-read/pos-offline-gate";

interface PosOfflineSyncProps {
  companyId: string | null;
  branchId: string | null;
  warehouseId: string | null;
  terminalId: string | null;
}

function namespaceOf(props: PosOfflineSyncProps): StoreNamespace | null {
  if (!props.companyId || !props.branchId || !props.terminalId) return null;
  return { companyId: props.companyId, branchId: props.branchId, terminalId: props.terminalId };
}

/**
 * Controlled POS offline read-side sync (Phase 6).
 *
 * DEFAULT-OFF: a strict no-op (renders null, registers no effects) unless the
 * offline feature flag is enabled for this scope. When enabled + authorized, it
 * bootstraps/pulls the local replica on startup, reconnect, focus, and Sync Now,
 * and publishes the POS offline state. It never writes and never changes the
 * online POS render path.
 */
export function PosOfflineSync(props: PosOfflineSyncProps) {
  const { companyId, branchId, warehouseId, terminalId } = props;
  const namespace = useMemo(
    () => namespaceOf({ companyId, branchId, warehouseId, terminalId }),
    [companyId, branchId, warehouseId, terminalId],
  );
  const flagEnabled = useMemo(
    () => getOfflineFeatureFlag(namespace ?? undefined).writeEnabled,
    [namespace],
  );

  useEffect(() => {
    if (!flagEnabled || !namespace) return;

    let cancelled = false;
    let controller: { sync: (t: any) => Promise<any>; isSyncing: () => boolean } | null = null;
    let replica: { readLocalSnapshot: () => Promise<any>; close?: () => void } | null = null;
    const statusStore = getPosOfflineStatusStore();
    const connectivity = getConnectivityStore();

    const publish = async (syncing: boolean) => {
      try {
        const snap = replica ? await replica.readLocalSnapshot() : null;
        const online = connectivity.getSnapshot().state === "online";
        const ctx = snap?.storeContext ?? null;
        const terminalScopeOk =
          !!ctx &&
          ctx.companyId === namespace.companyId &&
          ctx.branchId === namespace.branchId &&
          ctx.terminalId === namespace.terminalId;
        const gate = evaluatePosOfflineGate({
          flagEnabled: true,
          online,
          syncing,
          bootstrapComplete: Boolean(snap?.meta?.bootstrapComplete),
          replicaValid: !!ctx,
          terminalScopeOk,
          deviceStatus: "active",
          lastSyncAt: snap?.meta?.updatedAt ?? null,
          now: new Date(),
        });
        statusStore.set({
          active: true,
          state: gate.state,
          source: gate.offlineReadsPermitted ? (online ? "online" : "offline") : online ? "online" : "blocked",
          syncing,
          lastSyncAt: snap?.meta?.bootstrapComplete ? new Date().toISOString() : null,
          reason: gate.reason,
        });
      } catch {
        // Diagnostics must never break the page.
      }
    };

    const run = async (trigger: string) => {
      if (!controller || controller.isSyncing()) return;
      if (connectivity.getSnapshot().state !== "online") {
        await publish(false);
        return;
      }
      await publish(true);
      await controller.sync(trigger as any);
      await publish(false);
    };

    const onOnline = () => void run("reconnect");
    const onFocus = () => void run("focus");

    void (async () => {
      try {
        const [{ OfflineDatabase }, { StoreSnapshotRepository }, { PosSyncController }, { createPosSyncFetchers }] =
          await Promise.all([
            import("@/features/offline/local-db/database"),
            import("@/features/offline/replica/store-snapshot-repository"),
            import("@/features/offline/pos-read/pos-sync-controller"),
            import("@/features/offline/pos-read/network-client"),
          ]);
        if (cancelled) return;
        const db = await OfflineDatabase.open({ namespace });
        replica = db as any;
        const repo = new StoreSnapshotRepository(db, namespace);
        replica = repo as any;
        const deviceId = getOrCreateDeviceId();
        const fetchers = createPosSyncFetchers({
          deviceId,
          scope: { companyId: namespace.companyId, branchId: namespace.branchId, warehouseId },
        });
        controller = new PosSyncController(repo, fetchers);
        statusStore.registerManualSync(() => void run("manual"));

        window.addEventListener("online", onOnline);
        window.addEventListener("focus", onFocus);
        await run("startup");
      } catch {
        // Never break the page if offline init fails.
      }
    })();

    return () => {
      cancelled = true;
      statusStore.registerManualSync(null);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, [flagEnabled, namespace, warehouseId]);

  return null;
}
