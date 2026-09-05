"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { OfflineShell } from "@/components/offline/offline-shell";
import { useConnectivity } from "@/features/offline/pwa/use-connectivity";
import { getOfflineFeatureFlag } from "@/features/offline/feature-flags";
import {
  namespaceFromActiveTerminal,
  readActiveTerminal,
  type ActiveTerminal,
} from "@/features/offline/pos-read/active-terminal";
import { evaluatePosOfflineGate, type PosGateResult } from "@/features/offline/pos-read/pos-offline-gate";
import {
  posReadModelToPosClientProps,
  type PosClientData,
} from "@/features/offline/pos-read/pos-client-props";

const PosPageClient = dynamic(
  () => import("@/features/pos/components/pos-page-client").then((m) => m.PosPageClient),
  { ssr: false },
);

type WorkspaceState =
  | { kind: "loading" }
  | { kind: "flag_off" }
  | { kind: "online" }
  | { kind: "blocked"; reason: string | null }
  | { kind: "ready"; props: PosClientData };

const BLOCKED_MESSAGES: Record<string, string> = {
  never_bootstrapped: "This terminal has not finished its first online setup. Connect to the internet and open the POS online once to prepare offline use.",
  stale_beyond_policy: "Offline data is too old to use safely. Reconnect to refresh before continuing.",
  device_revoked: "This device has been revoked. Reconnect and sign in again.",
  terminal_scope: "This device is not registered to this store/terminal.",
  invalid_replica: "The offline data on this device is invalid. Reconnect to rebuild it.",
  device_not_activated: "This device is not activated for offline use.",
  not_set: "No offline terminal is configured on this device yet.",
};

/**
 * Public offline shell workspace (Phase 6.1).
 *
 * Renders a SAFE shell with NO store data in the server HTML. On the client,
 * when the offline flag is enabled and the terminal is offline-ready, it renders
 * the SAME `PosPageClient` from the device-local replica (read-only). Otherwise
 * it shows the minimal offline shell or a clear blocked message. Flag OFF keeps
 * the existing minimal shell behavior.
 */
export function OfflinePosWorkspace() {
  const connectivity = useConnectivity();
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const terminal = readActiveTerminal();
      const flag = getOfflineFeatureFlag(terminal ? namespaceFromActiveTerminal(terminal) : undefined);
      if (!flag.writeEnabled) {
        if (!cancelled) setState({ kind: "flag_off" });
        return;
      }
      // Online: online POS is authoritative — direct the user back to it.
      if (connectivity.state === "online") {
        if (!cancelled) setState({ kind: "online" });
        return;
      }
      if (!terminal) {
        if (!cancelled) setState({ kind: "blocked", reason: "not_set" });
        return;
      }
      try {
        const [{ OfflineDatabase }, { StoreSnapshotRepository }, { assertReplicaScope, PosReplicaScopeError }] =
          await Promise.all([
            import("@/features/offline/local-db/database"),
            import("@/features/offline/replica/store-snapshot-repository"),
            import("@/features/offline/pos-read/pos-read-repository"),
          ]);
        const namespace = namespaceFromActiveTerminal(terminal);
        const db = await OfflineDatabase.open({ namespace });
        const repo = new StoreSnapshotRepository(db, namespace);
        const snapshot = await repo.readLocalSnapshot();

        const ctxScopeOk =
          !!snapshot.storeContext &&
          snapshot.storeContext.companyId === terminal.companyId &&
          snapshot.storeContext.branchId === terminal.branchId &&
          snapshot.storeContext.terminalId === terminal.terminalId;

        const gate: PosGateResult = evaluatePosOfflineGate({
          flagEnabled: true,
          online: false,
          syncing: false,
          bootstrapComplete: snapshot.meta.bootstrapComplete,
          replicaValid: !!snapshot.storeContext,
          terminalScopeOk: ctxScopeOk,
          deviceStatus: "active",
          lastSyncAt: snapshot.meta.lastSyncAt,
          now: new Date(),
        });

        if (!gate.offlineReadsPermitted) {
          db.close();
          if (!cancelled) setState({ kind: "blocked", reason: gate.reason });
          return;
        }

        let model;
        try {
          model = assertReplicaScope(snapshot, { ...namespace, warehouseId: terminal.warehouseId });
        } catch (error) {
          db.close();
          if (!cancelled) {
            setState({
              kind: "blocked",
              reason: error instanceof PosReplicaScopeError ? "terminal_scope" : "invalid_replica",
            });
          }
          return;
        }

        const props = posReadModelToPosClientProps(model, {
          branchId: model.storeContext?.branchId ?? terminal.branchId,
          branchName: model.storeContext?.branchName ?? "",
          warehouseId: model.storeContext?.warehouseId ?? terminal.warehouseId ?? "",
          cashierName: "Offline",
          terminalId: terminal.terminalId,
        });
        db.close();
        if (!cancelled) setState({ kind: "ready", props });
      } catch {
        if (!cancelled) setState({ kind: "blocked", reason: "invalid_replica" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectivity.state]);

  if (state.kind === "ready") {
    return (
      <div>
        <div className="sticky top-0 z-20 bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-700">
          Offline — read-only. Sales, payments, and other changes are disabled until you reconnect.
        </div>
        <PosPageClient {...state.props} demoMode={false} />
      </div>
    );
  }

  if (state.kind === "blocked") {
    const message = (state.reason && BLOCKED_MESSAGES[state.reason]) || "Offline POS is not available on this device.";
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ backgroundColor: "#b45309" }} aria-hidden>!</div>
        <h1 className="text-lg font-semibold">Offline POS unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href="/pos" className="rounded-md border border-border px-4 py-2 text-sm font-medium">Try POS</Link>
      </main>
    );
  }

  if (state.kind === "online") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold">You are online</h1>
        <p className="text-sm text-muted-foreground">Continue in the live POS.</p>
        <Link href="/pos" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open POS</Link>
      </main>
    );
  }

  // flag_off or loading -> the existing minimal safe shell (no store data).
  return <OfflineShell />;
}
