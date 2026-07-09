"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import {
  canSubmitLoginCredentials,
  readLoginCredentialsFromForm,
} from "@/lib/auth/login-form-state";
import { cn } from "@/lib/utils";

type PortalLoginDictionary = {
  authNotReady: string;
  emailPlaceholder?: string;
  emailRequired?: string;
  hidePassword: string;
  invalidCredentials: string;
  invalidEmailFormat?: string;
  passwordPlaceholder?: string;
  passwordRequired?: string;
  showPassword: string;
  signIn: string;
  signingIn: string;
};

export function PortalLoginForm({
  dictionary,
  identifierAutoComplete,
  identifierLabel,
  identifierName = "identifier",
  identifierType = "text",
  loginApiPath,
  passwordLabel,
  redirectTo,
  variant = "default",
}: {
  dictionary: PortalLoginDictionary;
  identifierAutoComplete?: string;
  identifierLabel: string;
  identifierName?: string;
  identifierType?: "email" | "text";
  loginApiPath: string;
  passwordLabel: string;
  redirectTo: string;
  variant?: "default" | "premiumDark";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSubmit = canSubmitLoginCredentials(identifier, password);
  const passwordInputId = `${loginApiPath.replace(/\W+/g, "-")}-password`;
  const isPremiumDark = variant === "premiumDark";

  useEffect(() => {
    const input = document.getElementById(passwordInputId);
    if (input instanceof HTMLInputElement) {
      input.type = isPasswordVisible ? "text" : "password";
    }
  }, [isPasswordVisible, passwordInputId]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromForm = readLoginCredentialsFromForm(event.currentTarget, {
      secretFieldName: "password",
      usernameFieldName: identifierName,
    });
    const trimmedIdentifier = fromForm.username || identifier.trim();
    const rawPassword = fromForm.secret || password;

    if (!trimmedIdentifier) {
      setError(dictionary.emailRequired ?? dictionary.invalidCredentials);
      return;
    }

    if (identifierType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier)) {
      setError(dictionary.invalidEmailFormat ?? dictionary.invalidCredentials);
      return;
    }

    if (!rawPassword) {
      setError(dictionary.passwordRequired ?? dictionary.invalidCredentials);
      return;
    }

    if (!canSubmitLoginCredentials(trimmedIdentifier, rawPassword)) {
      setError(dictionary.invalidCredentials);
      return;
    }

    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch(loginApiPath, {
          body: JSON.stringify({
            email: trimmedIdentifier,
            identifier: trimmedIdentifier,
            password: rawPassword,
            username: trimmedIdentifier,
          }),
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          ok?: boolean;
          redirectTo?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setError(payload?.error ?? dictionary.invalidCredentials);
          return;
        }

        router.push(payload.redirectTo ?? redirectTo);
        router.refresh();
      } catch {
        setError(dictionary.authNotReady);
      }
    });
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <label className={cn("flex flex-col gap-2 text-sm font-medium", isPremiumDark && "text-[#CBD5E1]")}>
        {identifierLabel}
        <span className="relative">
          {isPremiumDark ? <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5EEAD4]" aria-hidden="true" /> : null}
          <input
            autoComplete={identifierAutoComplete ?? (identifierType === "email" ? "email" : "username")}
            className={cn(
              "h-12 rounded-md border border-border bg-background px-4 text-base outline-none transition focus:border-primary",
              isPremiumDark && "h-14 w-full rounded-2xl border-[#334155] bg-[#1E293B] pl-12 pr-4 text-[15px] text-[#F8FAFC] placeholder:text-[#94A3B8] focus:border-[#5EEAD4] focus:bg-[#1E293B] focus:ring-4 focus:ring-[#5EEAD4]/20",
            )}
            name={identifierName}
            onChange={(event) => setIdentifier(event.target.value)}
            onInput={(event) => setIdentifier(event.currentTarget.value)}
            placeholder={dictionary.emailPlaceholder}
            required
            type={identifierType}
            value={identifier}
          />
        </span>
      </label>
      <label className={cn("flex flex-col gap-2 text-sm font-medium", isPremiumDark && "text-[#CBD5E1]")}>
        {passwordLabel}
        <span className="relative">
          {isPremiumDark ? <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5EEAD4]" aria-hidden="true" /> : null}
          <input
            autoComplete="current-password"
            className={cn(
              "h-12 w-full rounded-md border border-border bg-background px-4 pr-12 text-base outline-none transition focus:border-primary",
              isPremiumDark && "h-14 rounded-2xl border-[#334155] bg-[#1E293B] pl-12 pr-12 text-[15px] text-[#F8FAFC] placeholder:text-[#94A3B8] focus:border-[#5EEAD4] focus:bg-[#1E293B] focus:ring-4 focus:ring-[#5EEAD4]/20",
            )}
            id={passwordInputId}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            onInput={(event) => setPassword(event.currentTarget.value)}
            placeholder={dictionary.passwordPlaceholder}
            required
            type={isPasswordVisible ? "text" : "password"}
            value={password}
          />
          <button
            aria-controls={passwordInputId}
            aria-label={isPasswordVisible ? dictionary.hidePassword : dictionary.showPassword}
            aria-pressed={isPasswordVisible}
            className={cn(
              "absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card",
              isPremiumDark && "text-[#94A3B8] hover:text-[#5EEAD4] focus:ring-[#5EEAD4] focus:ring-offset-[#111827]",
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsPasswordVisible((value) => !value);
            }}
            type="button"
          >
            {isPasswordVisible ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        </span>
      </label>
      {error ? (
        <p className={cn("text-sm text-danger", isPremiumDark && "rounded-2xl border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-[#F8FAFC]")}>{error}</p>
      ) : null}
      <button
        className={cn(
          "h-12 rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
          isPremiumDark && "group inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#5EEAD4] text-[15px] font-black text-[#020617] hover:bg-[#2DD4BF] active:bg-[#14B8A6] disabled:opacity-50",
        )}
        disabled={isPending || !canSubmit}
        type="submit"
      >
        {isPending ? dictionary.signingIn : dictionary.signIn}
        {isPremiumDark ? <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </button>
    </form>
  );
}
