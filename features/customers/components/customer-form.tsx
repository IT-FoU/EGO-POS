"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import type { MembershipLevel } from "@/features/customers/types";
import { calculatePointsForSpend, formatLak } from "@/features/customers/format";
import { createCustomerAction } from "@/features/customers/actions";
export function CustomerForm({ levels }: {
    levels: MembershipLevel[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [creditLimitLak, setCreditLimitLak] = useState(0);
    const [openingBalanceLak, setOpeningBalanceLak] = useState(0);
    const [message, setMessage] = useState<string | null>(null);
    const remainingCredit = Math.max(creditLimitLak - openingBalanceLak, 0);
    const openingPoints = useMemo(() => calculatePointsForSpend(openingBalanceLak), [openingBalanceLak]);
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const payload = {
            address: String(formData.get("address") ?? "").trim() || undefined,
            birthday: String(formData.get("birthday") ?? "").trim() || undefined,
            creditLimit: Number(formData.get("creditLimit") ?? 0),
            customerCode: String(formData.get("customerCode") ?? "").trim() || undefined,
            email: String(formData.get("email") ?? "").trim() || undefined,
            fullName: String(formData.get("fullName") ?? "").trim(),
            membershipLevelId: String(formData.get("membershipLevelId") ?? "").trim() || undefined,
            notes: String(formData.get("notes") ?? "").trim() || undefined,
            openingBalance: Number(formData.get("openingBalance") ?? 0),
            phone: String(formData.get("phone") ?? "").trim() || undefined,
        };
        startTransition(async () => {
            const result = await createCustomerAction(payload);
            if (!result.ok) {
                setMessage(result.error ?? t("ui.customer.save.failed"));
                return;
            }
            setMessage(t("ui.customer.saved.successfully"));
            router.refresh();
            router.push("/customers");
        });
    }
    return (<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/customers">
          <ArrowLeft aria-hidden="true"/>
          Back to customers
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <UserPlus aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">Create customer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.create.a.customer.profile.with.membership.cr")}</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" disabled={isPending} type="submit">
            <Save aria-hidden="true"/>
            {isPending ? t("ui.saving") : "Save"}
          </button>
        </div>
      </section>

      {message ? (<div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Customer information</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Customer Code">
              <input className="field-input font-mono" name="customerCode" placeholder="CUS-0005" required/>
            </Field>
            <Field label="Full Name">
              <input className="field-input" name="fullName" placeholder="Customer full name" required/>
            </Field>
            <Field label="Phone">
              <input className="field-input" name="phone" placeholder="+856 20 ..." required/>
            </Field>
            <Field label="Email">
              <input className="field-input" name="email" placeholder={t("ui.customer.example.com")} type="email"/>
            </Field>
            <Field label="Birthday">
              <input className="field-input" name="birthday" type="date"/>
            </Field>
            <Field label="Membership Level">
              <select className="field-input" name="membershipLevelId" defaultValue={levels[0]?.id}>
                {levels.map((level) => (<option key={level.id} value={level.id}>
                    {level.name} - {level.discountPercent}{t("ui.discount")}</option>))}
              </select>
            </Field>
            <Field label="Credit Limit">
              <input className="field-input" min="0" name="creditLimit" type="number" value={creditLimitLak} onChange={(event) => setCreditLimitLak(Number(event.target.value))}/>
            </Field>
            <Field label="Opening Balance">
              <input className="field-input" min="0" name="openingBalance" type="number" value={openingBalanceLak} onChange={(event) => setOpeningBalanceLak(Number(event.target.value))}/>
            </Field>
            <div className="md:col-span-2">
              <Field label="Address">
                <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="address" placeholder="Customer address"/>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="notes" placeholder="Customer notes"/>
              </Field>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Local preview</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label="Credit limit" value={`${formatLak(creditLimitLak)} LAK`}/>
            <Summary label="Opening balance" value={`${formatLak(openingBalanceLak)} LAK`}/>
            <Summary label="Remaining credit" value={`${formatLak(remainingCredit)} LAK`}/>
            <Summary label="Opening earned points" value={formatLak(openingPoints)}/>
            <Summary label="Points rule" value={t("ui.1.point.10.000.lak")}/>
            <Summary label="Database status" value="Real database"/>
          </dl>
        </aside>
      </section>
    </form>);
}
function Field({ children, label }: {
    children: React.ReactNode;
    label: string;
}) {
    return (<label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>);
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>);
}
