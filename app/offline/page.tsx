import type { Metadata } from "next";
import { OfflinePosWorkspace } from "@/components/offline/offline-pos-workspace";

export const metadata: Metadata = {
  title: "Offline — EGO POS",
};

/**
 * Public offline shell route. Pre-cached by the service worker and served as the
 * navigation fallback when an approved Mini Mart route is opened offline. The
 * server HTML contains NO store data. On the client, when the offline flag is
 * enabled and the terminal is offline-ready, it renders the same POS UI read-only
 * from the device-local replica; otherwise it shows the minimal safe shell.
 */
export default function OfflinePage() {
  return <OfflinePosWorkspace />;
}
