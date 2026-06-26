"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function EgoAdminLogoutButton({
  dictionary,
}: {
  dictionary: { signOut: string; signingOut: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/ego-admin/logout", { method: "POST" });
      router.push("/ego-admin/login");
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
      {isPending ? dictionary.signingOut : dictionary.signOut}
    </button>
  );
}
