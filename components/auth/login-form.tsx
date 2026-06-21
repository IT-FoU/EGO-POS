"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { getStoredEntryPath } from "@/features/platform/onboarding-context";

type LoginDictionary = {
  authNotReady: string;
  databaseUnavailable: string;
  invalidCredentials: string;
  username: string;
  password: string;
  signIn: string;
  signingIn: string;
  registerNewAccount: string;
};

export function LoginForm({ dictionary }: { dictionary: LoginDictionary }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

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

    return fetch("/api/auth/callback/credentials", {
      body,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setError(dictionary.invalidCredentials);
      return;
    }

    startTransition(async () => {
      setError(null);
      if (process.env.NODE_ENV === "development") {
        console.info("[login] submit", { username: trimmedUsername });
      }

      let response: Response;
      try {
        response = await submitCredentials(trimmedUsername, password);
      } catch (submitError) {
        if (process.env.NODE_ENV === "development") {
          console.info("[login] failed", {
            reason: submitError instanceof Error ? submitError.message : "Unknown login error",
            username: trimmedUsername,
          });
        }
        setError(dictionary.authNotReady);
        return;
      }

      if (!response.ok) {
        if (process.env.NODE_ENV === "development") {
          console.info("[login] failed", { status: response.status, username: trimmedUsername });
        }
        setError(
          response.status === 401
            ? dictionary.invalidCredentials
            : dictionary.authNotReady
        );
        return;
      }

      if (process.env.NODE_ENV === "development") {
        console.info("[login] success", { username: trimmedUsername });
      }
      router.push(getStoredEntryPath());
      router.refresh();
    });
  }

  return (
    <form action="/login" className="flex flex-col gap-5" method="post" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {dictionary.username}
        <input
          className="h-12 rounded-md border border-border bg-background px-4 text-base outline-none transition focus:border-primary"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {dictionary.password}
        <span className="relative">
          <input
            id="merchant-login-password"
            className="h-12 w-full rounded-md border border-border bg-background px-4 pr-12 text-base outline-none transition focus:border-primary"
            name="password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            id="merchant-login-password-toggle"
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
            onClick={() => setIsPasswordVisible((value) => !value)}
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        className="h-12 rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isPending}
      >
        {isPending ? dictionary.signingIn : dictionary.signIn}
      </button>
      <Link
        className="flex h-12 items-center justify-center rounded-md border border-border px-5 text-base font-semibold text-card-foreground transition hover:border-primary"
        href="/register"
      >
        {dictionary.registerNewAccount}
      </Link>
    </form>
  );
}
