import { redirect } from "next/navigation";
import { LogoContainer } from "@/components/brand/logo-container";
import { AdminLanguageToggle, AdminText } from "@/components/igo-admin/admin-i18n";
import { AdminLoginForm } from "@/components/igo-admin/admin-login-form";
import { getAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function IgoAdminLoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect("/igo-admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 text-center">
          <LogoContainer className="mx-auto" size={96} />
          <h1 className="mt-5 text-3xl font-semibold"><AdminText k="egoSuperAdmin" /></h1>
          <p className="mt-2 text-sm text-muted-foreground"><AdminText k="loginSubtitle" /></p>
        </div>
        <div className="mb-5 flex justify-center">
          <AdminLanguageToggle />
        </div>
        <AdminLoginForm />
      </section>
    </main>
  );
}
