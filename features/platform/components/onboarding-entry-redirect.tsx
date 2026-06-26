"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredEntryPath } from "@/features/platform/onboarding-context";

export function OnboardingEntryRedirect({ enabled = false }: { enabled?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const entryPath = getStoredEntryPath();
    if (entryPath !== "/businesses") {
      router.replace(entryPath);
    }
  }, [enabled, router]);

  return null;
}
