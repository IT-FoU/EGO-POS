"use client";

import { useEffect } from "react";
import { clearSettingsIndexScrollIfOutsideSettings } from "@/features/settings/settings-index-scroll";

/** Clears a pending Settings index restore after the user leaves Settings. */
export function SettingsIndexScrollGuard() {
  useEffect(() => {
    return () => {
      window.queueMicrotask(() => {
        clearSettingsIndexScrollIfOutsideSettings();
      });
    };
  }, []);
  return null;
}
