"use client";

import { useCallback, useEffect, useState } from "react";
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
  decideOfflineWorkspace,
  type OfflineWorkspaceDecision,
} from "@/features/offline/pos-read/offline-workspace-state";
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
  | { kind: "online_setup_pin"; terminal: ActiveTerminal }
  | { kind: "blocked"; reason: string | null }
  | { kind: "no_lock" }
  | { kind: "locked"; terminal: ActiveTerminal }
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
 * Load the offline replica for an already-unlocked, offline-ready terminal and
 * map it to POS client props. Re-checks the gate + scope as a defense in depth.
 * Returns a blocked reason instead of props when anything fails.
 */
async function loadReadyProps(
  terminal: ActiveTerminal,
): Promise<{ ok: true; props: PosClientData } | { ok: false; reason: string | null }> {
  const [{ OfflineDatabase }, { StoreSnapshotRepository }, { assertReplicaScope, PosReplicaScopeError }] =
    await Promise.all([
      import("@/features/offline/local-db/database"),
      import("@/features/offline/replica/store-snapshot-repository"),
      import("@/features/offline/pos-read/pos-read-repository"),
    ]);
  const namespace = namespaceFromActiveTerminal(terminal);
  const db = await OfflineDatabase.open({ namespace });
  try {
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
      deviceStatus: (snapshot.meta.deviceStatus as any) ?? "active",
      lastSyncAt: snapshot.meta.lastSyncAt,
      now: new Date(),
    });
    if (!gate.offlineReadsPermitted) {
      return { ok: false, reason: gate.reason };
    }
    let model;
    try {
      model = assertReplicaScope(snapshot, { ...namespace, warehouseId: terminal.warehouseId });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof PosReplicaScopeError ? "terminal_scope" : "invalid_replica",
      };
    }
    const props = posReadModelToPosClientProps(model, {
      branchId: model.storeContext?.branchId ?? terminal.branchId,
      branchName: model.storeContext?.branchName ?? "",
      warehouseId: model.storeContext?.warehouseId ?? terminal.warehouseId ?? "",
      cashierName: "Offline",
      terminalId: terminal.terminalId,
    });
    return { ok: true, props };
  } finally {
    db.close();
  }
}

/**
 * Public offline shell workspace (Phase 6.1 + 6.2).
 *
 * Renders a SAFE shell with NO store data in the server HTML. On the client,
 * when the offline flag is enabled and the terminal is offline-ready, it FIRST
 * requires a device-local PIN unlock (Phase 3 PBKDF2 foundation). Only after a
 * successful in-memory unlock does it render the SAME `PosPageClient` from the
 * device-local replica (read-only). While locked it shows only a PIN prompt with
 * no product/customer/stock/category data. Flag OFF keeps the minimal shell.
 */
export function OfflinePosWorkspace() {
  const connectivity = useConnectivity();
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Any connectivity change re-locks: the unlocked session lives only in memory
    // and must not survive a reconnect/offline transition without re-evaluation.
    setPin("");
    setError(null);

    void (async () => {
      const terminal = readActiveTerminal();
      const flag = getOfflineFeatureFlag(terminal ? namespaceFromActiveTerminal(terminal) : undefined);
      const online = connectivity.state === "online";

      // Compute the gate WITHOUT holding any store data in component state.
      let gate: PosGateResult = { state: "blocked", offlineReadsPermitted: false, reason: "not_set" };
      let lockSet = false;
      if (flag.writeEnabled && terminal) {
        try {
          const [{ OfflineDatabase }, { StoreSnapshotRepository }, { isDeviceLockSet }] = await Promise.all([
            import("@/features/offline/local-db/database"),
            import("@/features/offline/replica/store-snapshot-repository"),
            import("@/features/offline/auth/device-unlock"),
          ]);
          const namespace = namespaceFromActiveTerminal(terminal);
          const db = await OfflineDatabase.open({ namespace });
          try {
            const repo = new StoreSnapshotRepository(db, namespace);
            const snapshot = await repo.readLocalSnapshot();
            const ctxScopeOk =
              !!snapshot.storeContext &&
              snapshot.storeContext.companyId === terminal.companyId &&
              snapshot.storeContext.branchId === terminal.branchId &&
              snapshot.storeContext.terminalId === terminal.terminalId;
            gate = evaluatePosOfflineGate({
              flagEnabled: true,
              online,
              syncing: false,
              bootstrapComplete: snapshot.meta.bootstrapComplete,
              replicaValid: !!snapshot.storeContext,
              terminalScopeOk: ctxScopeOk,
              deviceStatus: (snapshot.meta.deviceStatus as any) ?? "active",
              lastSyncAt: snapshot.meta.lastSyncAt,
              now: new Date(),
            });
            lockSet = await isDeviceLockSet(db);
          } finally {
            db.close();
          }
        } catch {
          gate = { state: "blocked", offlineReadsPermitted: false, reason: "invalid_replica" };
        }
      }

      const decision: OfflineWorkspaceDecision = decideOfflineWorkspace({
        flagEnabled: flag.writeEnabled,
        online,
        hasTerminal: !!terminal,
        gate,
        lockSet,
      });
      if (cancelled) return;

      switch (decision.kind) {
        case "flag_off":
          setState({ kind: "flag_off" });
          break;
        case "online":
          setState({ kind: "online" });
          break;
        case "online_setup_pin":
          setState({ kind: "online_setup_pin", terminal: terminal! });
          break;
        case "no_lock":
          setState({ kind: "no_lock" });
          break;
        case "locked":
          setState({ kind: "locked", terminal: terminal! });
          break;
        case "blocked":
          setState({ kind: "blocked", reason: decision.reason });
          break;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectivity.state]);

  const handleUnlock = useCallback(
    async (terminal: ActiveTerminal) => {
      setBusy(true);
      setError(null);
      try {
        const [{ OfflineDatabase }, { unlockDevice }] = await Promise.all([
          import("@/features/offline/local-db/database"),
          import("@/features/offline/auth/device-unlock"),
        ]);
        const namespace = namespaceFromActiveTerminal(terminal);
        const db = await OfflineDatabase.open({ namespace });
        let result;
        try {
          result = await unlockDevice(db, pin);
        } finally {
          db.close();
        }
        if (!result.ok) {
          // Wrong PIN reveals nothing and never mutates the stored hash.
          setError(result.reason === "not_set" ? "No offline PIN is configured on this device." : "Incorrect PIN. Try again.");
          setPin("");
          return;
        }
        const loaded = await loadReadyProps(terminal);
        if (loaded.ok) {
          setPin("");
          setState({ kind: "ready", props: loaded.props });
        } else {
          setState({ kind: "blocked", reason: loaded.reason });
        }
      } catch {
        setError("Unable to unlock offline POS on this device.");
      } finally {
        setBusy(false);
      }
    },
    [pin],
  );

  const handleSetupPin = useCallback(
    async (terminal: ActiveTerminal) => {
      setBusy(true);
      setError(null);
      try {
        if (pin.length < 4) {
          setError("PIN must be at least 4 digits.");
          return;
        }
        const [{ OfflineDatabase }, { setDeviceLock }] = await Promise.all([
          import("@/features/offline/local-db/database"),
          import("@/features/offline/auth/device-unlock"),
        ]);
        const namespace = namespaceFromActiveTerminal(terminal);
        const db = await OfflineDatabase.open({ namespace });
        try {
          await setDeviceLock(db, pin);
        } finally {
          db.close();
        }
        setPin("");
        setNotice("Offline PIN set. You can now unlock POS when offline.");
        setState({ kind: "online" });
      } catch {
        setError("Unable to set an offline PIN on this device.");
      } finally {
        setBusy(false);
      }
    },
    [pin],
  );

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

  if (state.kind === "locked") {
    const terminal = state.terminal;
    return (
      <LockScreen
        title="Offline POS locked"
        description="Enter your device PIN to unlock read-only POS for this terminal."
        actionLabel={busy ? "Unlocking…" : "Unlock"}
        pin={pin}
        setPin={setPin}
        busy={busy}
        error={error}
        onSubmit={() => void handleUnlock(terminal)}
      />
    );
  }

  if (state.kind === "online_setup_pin") {
    const terminal = state.terminal;
    return (
      <LockScreen
        title="Set an offline PIN"
        description="Create a device PIN (at least 4 digits) to unlock read-only POS during an internet outage. Only a salted hash is stored on this device."
        actionLabel={busy ? "Saving…" : "Set PIN"}
        pin={pin}
        setPin={setPin}
        busy={busy}
        error={error}
        onSubmit={() => void handleSetupPin(terminal)}
        footer={
          <Link href="/pos" className="text-sm font-medium text-muted-foreground underline">
            Skip for now — open POS
          </Link>
        }
      />
    );
  }

  if (state.kind === "no_lock") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ backgroundColor: "#b45309" }} aria-hidden>!</div>
        <h1 className="text-lg font-semibold">Offline PIN required</h1>
        <p className="text-sm text-muted-foreground">
          No offline PIN is configured on this device. Connect to the internet, open POS, and set an offline PIN before using POS offline.
        </p>
        <Link href="/pos" className="rounded-md border border-border px-4 py-2 text-sm font-medium">Try POS</Link>
      </main>
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
        {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
        <p className="text-sm text-muted-foreground">Continue in the live POS.</p>
        <Link href="/pos" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open POS</Link>
      </main>
    );
  }

  // flag_off or loading -> the existing minimal safe shell (no store data).
  return <OfflineShell />;
}

interface LockScreenProps {
  title: string;
  description: string;
  actionLabel: string;
  pin: string;
  setPin: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  footer?: React.ReactNode;
}

/**
 * Minimal lock/unlock screen. Renders ONLY a PIN field — never any store data
 * (no product names, prices, customers, stock, categories, or counts).
 */
function LockScreen({ title, description, actionLabel, pin, setPin, busy, error, onSubmit, footer }: LockScreenProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ backgroundColor: "#0f766e" }} aria-hidden>lock</div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <input
          className="field-input h-12 w-full text-center text-2xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="Device PIN"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, ""))}
          maxLength={12}
          disabled={busy}
        />
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        <button
          type="submit"
          className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          disabled={busy || pin.length < 4}
        >
          {actionLabel}
        </button>
      </form>
      {footer}
    </main>
  );
}
