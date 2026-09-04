"use client";

import { useEffect } from "react";
import type { StoreNamespace } from "@/features/offline/types";
import { getOfflineFeatureFlag } from "@/features/offline/feature-flags";

/**
 * Registers (or unregisters) the Mini Mart service worker (Offline-first Phase 2).
 *
 * DEFAULT-OFF: the SW is only registered when the offline feature flag is
 * enabled for this scope (or NEXT_PUBLIC_OFFLINE_SW="true"). When disabled, any
 * previously registered EGO POS SW is unregistered so production online behavior
 * is fully preserved. The SW itself never caches admin/API/authenticated HTML.
 */
export function ServiceWorkerManager({ namespace }: { namespace?: Partial<StoreNamespace> }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const flag = getOfflineFeatureFlag(namespace);
    const swOptIn =
      String(process.env.NEXT_PUBLIC_OFFLINE_SW ?? "").toLowerCase() === "true";
    const shouldRegister = flag.writeEnabled || swOptIn;

    let cancelled = false;

    const unregisterAll = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => {
              const url = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? "";
              return url.endsWith("/sw.js");
            })
            .map((registration) => registration.unregister()),
        );
      } catch {
        // Ignore: unsupported or blocked.
      }
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is ready; activate it promptly.
              registration.waiting?.postMessage("SKIP_WAITING");
            }
          });
        });
      } catch {
        // Registration failures must never break the app.
      }
    };

    if (shouldRegister) {
      if (!cancelled) void register();
    } else {
      void unregisterAll();
    }

    return () => {
      cancelled = true;
    };
  }, [namespace]);

  return null;
}
