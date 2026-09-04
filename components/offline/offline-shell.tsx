"use client";

import Link from "next/link";
import { useConnectivity } from "@/features/offline/pwa/use-connectivity";

/**
 * Public offline shell (Offline-first Phase 2).
 *
 * Served when an installed PWA opens an approved Mini Mart route with no
 * network. It intentionally exposes NO store data — it only shows connectivity
 * and a path back into the app. Full offline POS rendering from the local
 * database arrives in later phases.
 */
export function OfflineShell() {
  const connectivity = useConnectivity();
  const online = connectivity.state === "online";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white"
        style={{ backgroundColor: "#0f766e" }}
        aria-hidden
      >
        E
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">EGO POS</h1>
        <p className="text-sm text-muted-foreground">
          {online
            ? "You are back online. Continue to the app."
            : "You are offline. The app shell is available; reconnect to load live data."}
        </p>
      </div>

      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          online
            ? "bg-emerald-500/15 text-emerald-600"
            : "bg-amber-500/15 text-amber-600"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}
          aria-hidden
        />
        {online ? "Online" : "Offline"}
      </span>

      <Link
        href="/pos"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Open POS
      </Link>
    </main>
  );
}
