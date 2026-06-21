"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export function FullScreenToggle({ locale: _locale }: { locale?: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  const Icon = isFullscreen ? Minimize2 : Maximize2;

  return (
    <button
      aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
      type="button"
      onClick={toggleFullscreen}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
