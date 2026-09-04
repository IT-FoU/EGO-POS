import type { Metadata } from "next";
import { OfflineShell } from "@/components/offline/offline-shell";

export const metadata: Metadata = {
  title: "Offline — EGO POS",
};

/**
 * Public offline shell route. Pre-cached by the service worker and served as the
 * navigation fallback when an approved Mini Mart route is opened offline. It is
 * intentionally unauthenticated and exposes no store data.
 */
export default function OfflinePage() {
  return <OfflineShell />;
}
