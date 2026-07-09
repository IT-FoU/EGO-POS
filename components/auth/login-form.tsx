"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { getStoredEntryPath } from "@/features/platform/onboarding-context";
import {
  canSubmitLoginCredentials,
  readLoginCredentialsFromForm,
} from "@/lib/auth/login-form-state";
import { cn } from "@/lib/utils";

type LoginDictionary = {
  authNotReady: string;
  databaseUnavailable: string;
  hidePassword: string;
  invalidCredentials: string;
  showPassword: string;
  username: string;
  password: string;
  signIn: string;
  signingIn: string;
  registerNewAccount: string;
};

type AuthCallbackPayload = {
  url?: string;
};

function credentialsSignInFailed(response: Response, payload: AuthCallbackPayload | null) {
  if (!response.ok) {
    return true;
  }

  const url = payload?.url ?? "";
  return url.includes("error=") || url.includes("/api/auth/error");
}

function readCredentialInputs() {
  const usernameInput = document.querySelector<HTMLInputElement>('input[name="username"]');
  const passwordInput = document.getElementById("merchant-login-password");

  return {
    secret: passwordInput instanceof HTMLInputElement ? passwordInput.value : "",
    username: usernameInput?.value ?? "",
  };
}

export function LoginForm({
  demoMode = false,
  dictionary,
  locale: _locale,
  registerHref = "/register",
  showRegisterLink = true,
  variant = "default",
}: {
  demoMode?: boolean;
  dictionary: LoginDictionary;
  locale?: "en" | "th";
  registerHref?: string;
  showRegisterLink?: boolean;
  variant?: "default" | "premiumDark";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSubmit = canSubmitLoginCredentials(username, password);
  const isPremiumDark = variant === "premiumDark";

  useEffect(() => {
    const input = document.getElementById("merchant-login-password");
    if (input instanceof HTMLInputElement) {
      input.type = isPasswordVisible ? "text" : "password";
    }
  }, [isPasswordVisible]);

  useEffect(() => {
    function syncAutofillValues() {
      const next = readCredentialInputs();
      if (next.username && next.username !== username) {
        setUsername(next.username);
      }
      if (next.secret && next.secret !== password) {
        setPassword(next.secret);
      }
    }

    syncAutofillValues();
    const timers = [100, 300, 800].map((delay) => window.setTimeout(syncAutofillValues, delay));
    window.addEventListener("focus", syncAutofillValues);

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      window.removeEventListener("focus", syncAutofillValues);
    };
  }, [password, username]);

  async function submitCredentials(trimmedUsername: string, rawPassword: string) {
    const csrfResponse = await fetch("/api/auth/csrf", {
      cache: "no-store",
    });
    if (!csrfResponse.ok) {
      throw new Error("AuthCsrfFailed");
    }

    const csrf = await csrfResponse.json() as { csrfToken?: string };
    if (!csrf.csrfToken) {
      throw new Error("AuthCsrfFailed");
    }

    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      json: "true",
      password: rawPassword,
      redirect: "false",
      username: trimmedUsername,
    });

    const response = await fetch("/api/auth/callback/credentials", {
      body,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    const payload = await response.json().catch(() => null) as AuthCallbackPayload | null;
    return { payload, response };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromForm = readLoginCredentialsFromForm(event.currentTarget);
    const trimmedUsername = fromForm.username || username.trim();
    const rawPassword = fromForm.secret || password;

    if (!canSubmitLoginCredentials(trimmedUsername, rawPassword)) {
      setError(dictionary.invalidCredentials);
      return;
    }

    startTransition(async () => {
      setError(null);
      if (process.env.NODE_ENV === "development") {
        console.info("[login] submit", { username: trimmedUsername });
      }

      try {
        const { payload, response } = await submitCredentials(trimmedUsername, rawPassword);
        if (credentialsSignInFailed(response, payload)) {
          if (process.env.NODE_ENV === "development") {
            console.info("[login] failed", { status: response.status, username: trimmedUsername });
          }
          setError(dictionary.invalidCredentials);
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.info("[login] success", { username: trimmedUsername });
        }
        const entryResponse = await fetch("/api/auth/store-entry-path", {
          credentials: "same-origin",
          method: "GET",
        });
        const entryPayload = (await entryResponse.json().catch(() => null)) as {
          redirectTo?: string;
        } | null;

        if (entryResponse.ok && entryPayload?.redirectTo) {
          router.push(entryPayload.redirectTo);
          router.refresh();
          return;
        }

        router.push(demoMode ? getStoredEntryPath() : "/businesses");
        router.refresh();
      } catch (submitError) {
        if (process.env.NODE_ENV === "development") {
          console.info("[login] failed", {
            reason: submitError instanceof Error ? submitError.message : "Unknown login error",
            username: trimmedUsername,
          });
        }
        setError(dictionary.authNotReady);
      }
    });
  }

  return (
    <form className="flex flex-col gap-5" id="merchant-login-form" onSubmit={handleSubmit}>
      <label className={cn("flex flex-col gap-2 text-sm font-medium", isPremiumDark && "text-[#CBD5E1]")}>
        {dictionary.username}
        <span className="relative">
          {isPremiumDark ? <UserRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5EEAD4]" aria-hidden="true" /> : null}
          <input
            className={cn(
              "h-12 rounded-md border border-border bg-background px-4 text-base outline-none transition focus:border-primary",
              isPremiumDark && "h-14 w-full rounded-2xl border-[#334155] bg-[#1E293B] pl-12 pr-4 text-[15px] text-[#F8FAFC] placeholder:text-[#94A3B8] focus:border-[#5EEAD4] focus:bg-[#1E293B] focus:ring-4 focus:ring-[#5EEAD4]/20",
            )}
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onInput={(event) => setUsername(event.currentTarget.value)}
            required
          />
        </span>
      </label>
      <label className={cn("flex flex-col gap-2 text-sm font-medium", isPremiumDark && "text-[#CBD5E1]")}>
        {dictionary.password}
        <span className="relative">
          {isPremiumDark ? <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5EEAD4]" aria-hidden="true" /> : null}
          <input
            id="merchant-login-password"
            className={cn(
              "h-12 w-full rounded-md border border-border bg-background px-4 pr-12 text-base outline-none transition focus:border-primary",
              isPremiumDark && "h-14 rounded-2xl border-[#334155] bg-[#1E293B] pl-12 pr-12 text-[15px] text-[#F8FAFC] placeholder:text-[#94A3B8] focus:border-[#5EEAD4] focus:bg-[#1E293B] focus:ring-4 focus:ring-[#5EEAD4]/20",
            )}
            name="password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onInput={(event) => setPassword(event.currentTarget.value)}
            required
          />
          <button
            id="merchant-login-password-toggle"
            aria-controls="merchant-login-password"
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
        type="submit"
        disabled={isPending || !canSubmit}
      >
        {isPending ? dictionary.signingIn : dictionary.signIn}
        {isPremiumDark ? <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" /> : null}
      </button>
      {showRegisterLink ? (
        <Link
          className="flex h-12 items-center justify-center rounded-md border border-border px-5 text-base font-semibold text-card-foreground transition hover:border-primary"
          href={registerHref}
        >
          {dictionary.registerNewAccount}
        </Link>
      ) : null}
    </form>
  );
}
