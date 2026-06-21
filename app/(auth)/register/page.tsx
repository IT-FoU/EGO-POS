import Link from "next/link";
import { LogoContainer } from "@/components/brand/logo-container";
import { APP_NAME } from "@/lib/constants";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={96} />
          <h1 className="mt-5 text-3xl font-bold tracking-normal">{APP_NAME}</h1>
        </div>
        <form className="grid gap-5">
          <label className="grid gap-2 text-sm font-medium">
            Owner name
            <input className="field-input" name="ownerName" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input className="field-input" name="email" type="email" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Password
            <input className="field-input" name="password" type="password" required />
          </label>
          <Link
            className="flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:opacity-90"
            href="/businesses"
          >
            Continue
          </Link>
          <Link
            className="text-center text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            href="/login"
          >
            Back to login
          </Link>
        </form>
      </section>
    </main>
  );
}
