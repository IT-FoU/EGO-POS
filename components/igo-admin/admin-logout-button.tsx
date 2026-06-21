"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminLocale } from "@/components/igo-admin/admin-i18n";

export function AdminLogoutButton() {
  const router = useRouter();
  const { copy } = useAdminLocale();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/igo-admin/logout", { method: "POST" });
      router.push("/igo-admin/login");
      router.refresh();
    });
  }

  return (
    <button
      className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-60"
      disabled={isPending}
      onClick={handleLogout}
      type="button"
    >
      {isPending ? copy.signingOut : copy.signOut}
    </button>
  );
}
