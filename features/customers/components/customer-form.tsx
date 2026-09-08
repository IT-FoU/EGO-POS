"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import type { MembershipLevel } from "@/features/customers/types";
import { calculatePointsForSpend, formatLak } from "@/features/customers/format";
import { createCustomerAction } from "@/features/customers/actions";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { localizeCustomerError, localizedMembershipLabel, tCustomers } from "@/lib/i18n/customers-copy";

export function CustomerForm({
  levels,
  locale: localeProp,
}: {
  levels: MembershipLevel[];
  locale?: SupportedLocale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creditLimitLak, setCreditLimitLak] = useState(0);
  const [openingBalanceLak, setOpeningBalanceLak] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const locale = useAppLocale(localeProp);
  const remainingCredit = Math.max(creditLimitLak - openingBalanceLak, 0);
  const openingPoints = useMemo(() => calculatePointsForSpend(openingBalanceLak), [openingBalanceLak]);
  const t = (key: string) => tCustomers(key, locale);

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
        setMessage(localizeCustomerError(result.error ?? t("customerSaveFailed"), locale));
        return;
      }
      setMessage(t("customerSaved"));
      router.refresh();
      router.push("/customers");
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/customers">
          <ArrowLeft aria-hidden="true" />
          {t("backToCustomers")}
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <UserPlus aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{t("createCustomerTitle")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("createCustomerSubtitle")}</p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            disabled={isPending}
            type="submit"
          >
            <Save aria-hidden="true" />
            {isPending ? t("saving") : t("save")}
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("customerInformation")}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label={t("customerCode")}>
              <input className="field-input font-mono" name="customerCode" placeholder={t("autoMemCode")} />
            </Field>
            <Field label={t("fullName")}>
              <input className="field-input" name="fullName" placeholder={t("fullNamePlaceholder")} required />
            </Field>
            <Field label={t("phone")}>
              <input className="field-input" name="phone" placeholder={t("phonePlaceholder")} required />
            </Field>
            <Field label={t("email")}>
              <input className="field-input" name="email" placeholder={t("emailPlaceholder")} type="email" />
            </Field>
            <Field label={t("birthday")}>
              <input className="field-input" name="birthday" type="date" />
            </Field>
            <Field label={t("membershipLevel")}>
              <select className="field-input" name="membershipLevelId" defaultValue="">
                <option value="">{t("noMembership")}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {localizedMembershipLabel(level.name, locale)} - {level.discountPercent}
                    {t("discount")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("creditLimit")}>
              <input
                className="field-input"
                min="0"
                name="creditLimit"
                type="number"
                value={creditLimitLak}
                onChange={(event) => setCreditLimitLak(Number(event.target.value))}
              />
            </Field>
            <Field label={t("openingBalance")}>
              <input
                className="field-input"
                min="0"
                name="openingBalance"
                type="number"
                value={openingBalanceLak}
                onChange={(event) => setOpeningBalanceLak(Number(event.target.value))}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label={t("address")}>
                <textarea
                  className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary"
                  name="address"
                  placeholder={t("placeholderAddress")}
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label={t("notes")}>
                <textarea
                  className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary"
                  name="notes"
                  placeholder={t("notesPlaceholder")}
                />
              </Field>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("localPreview")}</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label={t("creditLimit")} value={`${formatLak(creditLimitLak)} LAK`} />
            <Summary label={t("openingBalance")} value={`${formatLak(openingBalanceLak)} LAK`} />
            <Summary label={t("remainingCredit")} value={`${formatLak(remainingCredit)} LAK`} />
            <Summary label={t("openingEarnedPoints")} value={formatLak(openingPoints)} />
            <Summary label={t("pointsRule")} value={t("pointsRule")} />
            <Summary label={t("databaseStatus")} value={t("realDatabase")} />
          </dl>
        </aside>
      </section>
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
