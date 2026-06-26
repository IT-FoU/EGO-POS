"use client";

import { t } from "@/lib/i18n/ui";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAdminLocale } from "@/components/igo-admin/admin-i18n";
export function AdminLoginForm() {
    const router = useRouter();
    const { copy } = useAdminLocale();
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [isPending, startTransition] = useTransition();
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
            setError(null);
            const response = await fetch("/api/super-admin/login", {
                body: JSON.stringify({
                    identifier: formData.get("username"),
                    password: formData.get("password"),
                    username: formData.get("username"),
                }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as {
                    error?: string;
                } | null;
                setError(payload?.error ?? t("ui.unable.to.sign.in"));
                return;
            }
            const payload = (await response.json().catch(() => null)) as {
                redirectTo?: string;
            } | null;
            router.push(payload?.redirectTo ?? "/super-admin");
            router.refresh();
        });
    }
    return (<form className="grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium">
        {copy.adminUsername}
        <input className="field-input" name="username" required autoComplete="username"/>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {copy.adminPassword}
        <span className="relative">
          <input className="field-input pr-11" name="password" required type={showPassword ? "text" : "password"} autoComplete="current-password"/>
          <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition hover:text-foreground" type="button" onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff className="size-4" aria-hidden="true"/> : <Eye className="size-4" aria-hidden="true"/>}
          </button>
        </span>
      </label>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      <button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" disabled={isPending} type="submit">
        {isPending ? copy.signingIn : copy.signIn}
      </button>
    </form>);
}
