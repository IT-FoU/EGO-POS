"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredEntryPath } from "@/features/platform/onboarding-context";

export function OnboardingEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const entryPath = getStoredEntryPath();

    if (entryPath !== "/businesses") {
      router.replace(entryPath);
    }
  }, [router]);

  return null;
}
