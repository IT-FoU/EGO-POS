import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/constants";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

const templates = [
  { key: "mini-mart", name: "Mini Mart", status: "Ready / Active" },
  { key: "restaurant", name: "Restaurant", status: "Draft / Coming soon" },
  { key: "pharmacy", name: "Pharmacy", status: "Draft / Coming soon" },
  { key: "clothes-shop", name: "Clothes Shop", status: "Draft / Coming soon" },
  { key: "wholesale", name: "Wholesale", status: "Draft / Coming soon" },
  { key: "online-seller", name: "Online Seller", status: "Draft / Coming soon" },
  { key: "clothes-rental", name: "Clothes Rental", status: "Draft / Coming soon" },
  { key: "event-rental", name: "Event Rental", status: "Draft / Coming soon" },
] as const;

const fields = [
  "Business name",
  "Store name",
  "Business phone",
  "Business address",
  "Country / region",
  "Currency",
  "Timezone",
] as const;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const isThai = locale === "th";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] px-4 py-8 text-[#F8FAFC] sm:px-6">
      <section className="mx-auto grid w-full max-w-7xl gap-6">
        <header className="rounded-2xl border border-[#334155] bg-[#111827] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#5EEAD4]">{APP_NAME}</p>
              <h1 className="mt-3 text-3xl font-black tracking-normal text-[#F8FAFC] md:text-4xl">
                {isThai ? "ตัวช่วยตั้งค่าธุรกิจ" : "Business Setup Wizard"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#CBD5E1]">
                {isThai
                  ? "หน้านี้แสดงขั้นตอนการตั้งค่าเท่านั้น ระบบสร้างธุรกิจจริงยังไม่ได้เชื่อมต่อ จึงไม่มีการเพิ่มข้อมูลปลอม"
                  : "This page shows the setup flow only. Real business creation is not connected yet, so no fake business data is created."}
              </p>
            </div>
            <Link
              className="rounded-xl border border-[#334155] px-4 py-2 text-sm font-bold text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]"
              href={`/auth?tab=create&locale=${locale}`}
            >
              {isThai ? "กลับไปหน้า Auth" : "Back to Auth"}
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-6">
            <WizardPanel index="1" title={isThai ? "เลือกเทมเพลต" : "Choose Template"}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {templates.map((template) => {
                  const isReady = template.key === "mini-mart";
                  return (
                    <div className="rounded-2xl border border-[#334155] bg-[#020617] p-4" key={template.key}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-black text-[#F8FAFC]">{template.name}</h3>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${isReady ? "border-[#22C55E]/50 text-[#22C55E]" : "border-[#334155] text-[#94A3B8]"}`}>
                          {isReady ? (isThai ? "พร้อมใช้งาน" : "Ready") : (isThai ? "ฉบับร่าง" : "Draft")}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[#94A3B8]">{template.status}</p>
                    </div>
                  );
                })}
              </div>
            </WizardPanel>

            <WizardPanel index="2" title={isThai ? "ข้อมูลธุรกิจ" : "Business Information"}>
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => (
                  <label className="grid gap-2 text-sm font-bold text-[#CBD5E1]" key={field}>
                    {field}
                    <input
                      className="h-12 cursor-not-allowed rounded-xl border border-[#334155] bg-[#1E293B] px-4 text-sm text-[#64748B]"
                      disabled
                      placeholder={isThai ? "ยังไม่เชื่อมต่อ" : "Not connected yet"}
                    />
                  </label>
                ))}
              </div>
            </WizardPanel>

            <WizardPanel index="3" title={isThai ? "เลือกแผน" : "Plan Selection"}>
              <div className="grid gap-3 md:grid-cols-2">
                <PlanCard title="Free Plan" description={isThai ? "พร้อมสำหรับ MVP เมื่อสร้างธุรกิจจริงเชื่อมต่อแล้ว" : "Ready for MVP once real business creation is connected."} />
                <PlanCard title="Pro Plan" description={isThai ? "Billing backend ยังไม่ได้เชื่อมต่อ จึงไม่เปิดใช้งานการชำระเงิน" : "Billing backend is not connected yet, so payment activation is disabled."} />
              </div>
            </WizardPanel>

            <WizardPanel index="4" title={isThai ? "ยืนยันการตั้งค่า" : "Confirm Setup"}>
              <div className="grid gap-3 md:grid-cols-2">
                {["Template selected", "Business name", "Store name", "Plan selected", "Owner email"].map((item) => (
                  <div className="rounded-xl border border-[#334155] bg-[#020617] p-4" key={item}>
                    <div className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">{item}</div>
                    <div className="mt-2 text-sm font-bold text-[#64748B]">{isThai ? "ยังไม่มีข้อมูลจริง" : "No real data yet"}</div>
                  </div>
                ))}
              </div>
            </WizardPanel>
          </div>

          <aside className="grid min-w-0 content-start gap-4">
            <section className="rounded-2xl border border-[#334155] bg-[#111827] p-5">
              <h2 className="text-lg font-black text-[#F8FAFC]">{isThai ? "สถานะการตั้งค่า" : "Setup Status"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                {isThai ? "Business creation backend is not connected yet." : "Business creation backend is not connected yet."}
              </p>
              <button
                className="mt-5 h-12 w-full cursor-not-allowed rounded-2xl border border-[#334155] bg-[#1E293B] px-5 text-sm font-black text-[#64748B]"
                disabled
                type="button"
              >
                {isThai ? "สร้างธุรกิจยังไม่ได้เชื่อมต่อ" : "Create business not connected"}
              </button>
            </section>
            <section className="rounded-2xl border border-[#334155] bg-[#020617] p-5">
              <h2 className="text-lg font-black text-[#F8FAFC]">{isThai ? "เสร็จสิ้นการตั้งค่า" : "Setup Complete"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                {isThai
                  ? "จะแสดงความสำเร็จเฉพาะหลังจาก backend สร้างธุรกิจจริงสำเร็จเท่านั้น"
                  : "Success will only be shown after the real backend creates the business."}
              </p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function WizardPanel({ children, index, title }: { children: ReactNode; index: string; title: string }) {
  return (
    <section className="rounded-2xl border border-[#334155] bg-[#111827] p-5 shadow-xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-[#5EEAD4] text-sm font-black text-[#020617]">{index}</span>
        <h2 className="text-xl font-black text-[#F8FAFC]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PlanCard({ description, title }: { description: string; title: string }) {
  return (
    <div className="rounded-2xl border border-[#334155] bg-[#020617] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-black text-[#F8FAFC]">{title}</h3>
        <span className="rounded-full border border-[#334155] px-2 py-1 text-[11px] font-bold text-[#94A3B8]">Coming soon</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#94A3B8]">{description}</p>
      <button className="mt-4 h-10 w-full cursor-not-allowed rounded-xl border border-[#334155] text-sm font-bold text-[#64748B]" disabled type="button">
        Not connected yet
      </button>
    </div>
  );
}
