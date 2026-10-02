"use client";

import { useEffect } from "react";
import {
  consumeSettingsIndexScroll,
  settingsIndexScrollTarget,
  type SettingsIndexScrollSnapshot,
} from "@/features/settings/settings-index-scroll";

function applySettingsIndexScroll(snapshot: SettingsIndexScrollSnapshot) {
  const row = document.querySelector(`[data-settings-row="${CSS.escape(snapshot.rowHref)}"]`);
  const rowTop = row instanceof HTMLElement ? row.getBoundingClientRect().top + window.scrollY : null;
  const top = settingsIndexScrollTarget(snapshot, rowTop, window.innerHeight);
  window.scrollTo({ behavior: "instant", left: 0, top });
}

/** Restores the Settings index once after returning from a sub-page. Does not lock later scrolling. */
export function SettingsIndexScrollRestore() {
  useEffect(() => {
    const snapshot = consumeSettingsIndexScroll();
    if (!snapshot) return;
    applySettingsIndexScroll(snapshot);
    const timeout = window.setTimeout(() => applySettingsIndexScroll(snapshot), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  return null;
}
