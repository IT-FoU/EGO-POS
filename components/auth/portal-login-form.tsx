"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import {
  canSubmitLoginCredentials,
  readLoginCredentialsFromForm,
} from "@/lib/auth/login-form-state";

type PortalLoginDictionary = {
  authNotReady: string;
  hidePassword: string;
  invalidCredentials: string;
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
}: {
  dictionary: PortalLoginDictionary;
  identifierAutoComplete?: string;
  identifierLabel: string;
  identifierName?: string;
  identifierType?: "email" | "text";
  loginApiPath: string;
  passwordLabel: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSubmit = canSubmitLoginCredentials(identifier, password);
  const passwordInputId = `${loginApiPath.replace(/\W+/g, "-")}-password`;

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
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {identifierLabel}
        <input
          autoComplete={identifierAutoComplete ?? (identifierType === "email" ? "email" : "username")}
          className="h-12 rounded-md border border-border bg-background px-4 text-base outline-none transition focus:border-primary"
          name={identifierName}
          onChange={(event) => setIdentifier(event.target.value)}
          onInput={(event) => setIdentifier(event.currentTarget.value)}
          required
          type={identifierType}
          value={identifier}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {passwordLabel}
        <span className="relative">
          <input
            autoComplete="current-password"
            className="h-12 w-full rounded-md border border-border bg-background px-4 pr-12 text-base outline-none transition focus:border-primary"
            id={passwordInputId}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            onInput={(event) => setPassword(event.currentTarget.value)}
            required
            type={isPasswordVisible ? "text" : "password"}
            value={password}
          />
          <button
            aria-controls={passwordInputId}
            aria-label={isPasswordVisible ? dictionary.hidePassword : dictionary.showPassword}
            aria-pressed={isPasswordVisible}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        className="h-12 rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending || !canSubmit}
        type="submit"
      >
        {isPending ? dictionary.signingIn : dictionary.signIn}
      </button>
    </form>
  );
}
