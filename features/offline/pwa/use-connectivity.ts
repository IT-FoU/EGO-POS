"use client";

import { useSyncExternalStore } from "react";
import { getConnectivityStore, type ConnectivitySnapshot } from "./connectivity";

/** React hook exposing the current connectivity snapshot. */
export function useConnectivity(): ConnectivitySnapshot {
  const store = getConnectivityStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
