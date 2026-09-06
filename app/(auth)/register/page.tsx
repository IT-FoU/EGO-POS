import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default async function RegisterPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#020617] px-4 py-8 text-[#F8FAFC] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(94,234,212,0.12),transparent_32rem)]" />
      <section className="relative z-10 m-auto w-full max-w-[500px]">
        <div className="rounded-[2rem] border border-[#334155] bg-[#111827] p-6 text-center shadow-xl sm:p-8">
          <div className="mx-auto mb-6 grid size-12 place-items-center rounded-2xl border border-[#5EEAD4] bg-[#1E293B] text-xl font-black text-[#5EEAD4]">
            E
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#F8FAFC]">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">{"Store access"}</p>

          <div className="mt-8 rounded-2xl border border-[#334155] bg-[#020617] p-5">
            <h2 className="text-xl font-black text-[#F8FAFC]">
              {"Registration is not open yet"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#CBD5E1]">
              New business setup is currently managed by EGO POS Admin.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
              Please contact the platform owner to create a new business account.
            </p>
          </div>

          <Link
            className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-[#5EEAD4] px-5 text-base font-black text-[#020617] transition hover:bg-[#2DD4BF] active:bg-[#14B8A6]"
            href="/login"
          >
            {"Back to login"}
          </Link>
        </div>
      </section>
    </main>
  );
}
