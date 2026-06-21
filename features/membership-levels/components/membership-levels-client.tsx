"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Edit3, Eye, Plus, QrCode, Save, Search, Trash2 } from "lucide-react";
import { archiveMembershipLevelAction, createMembershipLevelAction, deleteMembershipLevelAction, updateMembershipLevelAction, } from "@/features/membership-levels/actions";
import type { MembershipLevelRecord } from "@/features/membership-levels/types";
import { cn } from "@/lib/utils";
type DurationOption = "never" | "1_month" | "2_months" | "3_months" | "4_months" | "5_months" | "6_months" | "7_months" | "8_months" | "9_months" | "10_months" | "11_months" | "12_months" | "1_year" | "2_years" | "3_years";
type LevelListModalKind = "all" | "active" | "referenced";
type DiscountType = "percent" | "fixed_amount" | "percent_rounding";
type RoundingRule = "none" | "down_500" | "up_500" | "nearest_500" | "down_1000" | "up_1000" | "nearest_1000";
type FormState = {
    autoUpgrade: boolean;
    benefitsDescription: string;
    cardColor: string;
    discountAmountLak: number;
    discountPercent: number;
    discountType: DiscountType;
    duration: DurationOption;
    exampleBillTotalLak: number;
    expiryDate: string;
    id?: string;
    isActive: boolean;
    minSpendLak: number;
    name: string;
    roundingRule: RoundingRule;
    startDate: string;
    welcomeBonusPoints: number;
};
const emptyForm: FormState = {
    autoUpgrade: true,
    benefitsDescription: "",
    cardColor: "#2563eb",
    discountAmountLak: 0,
    discountPercent: 0,
    discountType: "percent",
    duration: "never",
    exampleBillTotalLak: 25000,
    expiryDate: "",
    isActive: true,
    minSpendLak: 0,
    name: "",
    roundingRule: "none",
    startDate: todayLocalDate(),
    welcomeBonusPoints: 0,
};
const durationOptions: Array<{
    label: string;
    months: number;
    value: DurationOption;
}> = [
    { label: "Never expire", months: 0, value: "never" },
    { label: "1 month", months: 1, value: "1_month" },
    { label: "2 months", months: 2, value: "2_months" },
    { label: "3 months", months: 3, value: "3_months" },
    { label: "4 months", months: 4, value: "4_months" },
    { label: "5 months", months: 5, value: "5_months" },
    { label: "6 months", months: 6, value: "6_months" },
    { label: "7 months", months: 7, value: "7_months" },
    { label: "8 months", months: 8, value: "8_months" },
    { label: "9 months", months: 9, value: "9_months" },
    { label: "10 months", months: 10, value: "10_months" },
    { label: "11 months", months: 11, value: "11_months" },
    { label: "12 months", months: 12, value: "12_months" },
    { label: "1 year", months: 12, value: "1_year" },
    { label: "2 years", months: 24, value: "2_years" },
    { label: "3 years", months: 36, value: "3_years" },
];
const durationLabels = Object.fromEntries(durationOptions.map((option) => [option.value, option.label])) as Record<DurationOption, string>;
const discountTypeOptions: Array<{
    label: string;
    value: DiscountType;
}> = [
    { label: "Percent discount", value: "percent" },
    { label: "Fixed amount discount LAK", value: "fixed_amount" },
    { label: t("ui.percent.rounding.rule"), value: "percent_rounding" },
];
const discountTypeLabels = Object.fromEntries(discountTypeOptions.map((option) => [option.value, option.label])) as Record<DiscountType, string>;
const roundingRuleOptions: Array<{
    label: string;
    value: RoundingRule;
}> = [
    { label: "No rounding", value: "none" },
    { label: "Round down to nearest 500 LAK", value: "down_500" },
    { label: "Round up to nearest 500 LAK", value: "up_500" },
    { label: "Round nearest 500 LAK", value: "nearest_500" },
    { label: t("ui.round.down.to.nearest.1.000.lak"), value: "down_1000" },
    { label: t("ui.round.up.to.nearest.1.000.lak"), value: "up_1000" },
    { label: t("ui.round.nearest.1.000.lak"), value: "nearest_1000" },
];
const roundingRuleLabels = Object.fromEntries(roundingRuleOptions.map((option) => [option.value, option.label])) as Record<RoundingRule, string>;
function formatLak(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
export function MembershipLevelsClient({ levels }: {
    levels: MembershipLevelRecord[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<FormState>(emptyForm);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
    const [viewLevel, setViewLevel] = useState<MembershipLevelRecord | null>(null);
    const [listModal, setListModal] = useState<LevelListModalKind | null>(null);
    const [message, setMessage] = useState<{
        tone: "error" | "success";
        text: string;
    } | null>(null);
    const filteredLevels = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return levels.filter((level) => {
            const matchesQuery = !normalizedQuery || level.name.toLowerCase().includes(normalizedQuery);
            const matchesStatus = statusFilter === "all" ||
                (statusFilter === "active" ? level.isActive : !level.isActive);
            return matchesQuery && matchesStatus;
        });
    }, [levels, query, statusFilter]);
    const activeCount = levels.filter((level) => level.isActive).length;
    const referencedCount = levels.filter((level) => level.customerCount + level.promotionCount > 0).length;
    function update<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((current) => {
            const next = { ...current, [key]: value };
            if (key === "duration") {
                next.expiryDate = value === "never" ? "" : calculateExpiryDate(next.startDate, value as DurationOption);
            }
            if (key === "startDate" && next.duration !== "never") {
                next.expiryDate = calculateExpiryDate(value as string, next.duration);
            }
            return next;
        });
    }
    function editLevel(level: MembershipLevelRecord) {
        setForm({
            autoUpgrade: true,
            benefitsDescription: `Benefits for ${level.name} members.`,
            cardColor: pickCardColor(level.name),
            discountAmountLak: 0,
            discountPercent: level.discountPercent,
            discountType: "percent",
            duration: "never",
            exampleBillTotalLak: 25000,
            expiryDate: "",
            id: level.id,
            isActive: level.isActive,
            minSpendLak: level.minSpendLak,
            name: level.name,
            roundingRule: "none",
            startDate: todayLocalDate(),
            welcomeBonusPoints: 0,
        });
        setMessage(null);
    }
    function resetForm() {
        setForm(emptyForm);
        setMessage(null);
    }
    function validate() {
        if (!form.name.trim())
            return t("ui.membership.level.name.is.required");
        if (form.minSpendLak < 0)
            return t("ui.minimum.spend.cannot.be.negative");
        if (form.discountPercent < 0 || form.discountPercent > 100)
            return t("ui.discount.percent.must.be.between.0.and.100");
        if (form.discountAmountLak < 0)
            return t("ui.discount.amount.cannot.be.negative");
        if (form.exampleBillTotalLak < 0)
            return t("ui.example.bill.total.cannot.be.negative");
        if (form.welcomeBonusPoints < 0)
            return t("ui.welcome.bonus.points.cannot.be.negative");
        return null;
    }
    function saveLevel(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const validationError = validate();
        if (validationError) {
            setMessage({ text: validationError, tone: "error" });
            return;
        }
        setMessage(null);
        startTransition(async () => {
            const payload = {
                discountPercent: form.discountPercent,
                isActive: form.isActive,
                minSpendLak: form.minSpendLak,
                name: form.name.trim(),
            };
            const result = form.id
                ? await updateMembershipLevelAction(form.id, payload)
                : await createMembershipLevelAction(payload);
            if (!result.ok) {
                setMessage({ text: result.error ?? t("ui.membership.level.save.failed"), tone: "error" });
                return;
            }
            setMessage({
                text: form.id
                    ? t("ui.membership.level.updated.preview.only.fields") : t("ui.membership.level.created.preview.only.fields"),
                tone: "success",
            });
            setForm(emptyForm);
            router.refresh();
        });
    }
    function archiveLevel(level: MembershipLevelRecord) {
        setMessage(null);
        startTransition(async () => {
            const result = await archiveMembershipLevelAction(level.id);
            if (!result.ok) {
                setMessage({ text: result.error ?? t("ui.membership.level.archive.failed"), tone: "error" });
                return;
            }
            setMessage({ text: t("ui.membership.level.archived"), tone: "success" });
            if (form.id === level.id)
                setForm(emptyForm);
            router.refresh();
        });
    }
    function deleteLevel(level: MembershipLevelRecord) {
        setMessage(null);
        startTransition(async () => {
            const result = await deleteMembershipLevelAction(level.id);
            if (!result.ok) {
                setMessage({ text: result.error ?? t("ui.membership.level.delete.failed"), tone: "error" });
                return;
            }
            setMessage({ text: t("ui.membership.level.deleted.or.safely.archived."), tone: "success" });
            if (form.id === level.id)
                setForm(emptyForm);
            router.refresh();
        });
    }
    return (<div className="w-full max-w-[100vw] overflow-x-hidden">
      {viewLevel ? <LevelViewModal level={viewLevel} onClose={() => setViewLevel(null)} onEdit={() => editLevel(viewLevel)}/> : null}
      {listModal ? (<LevelListModal kind={listModal} levels={getLevelsForModal(listModal, levels)} onClose={() => setListModal(null)} onEdit={(level) => {
                editLevel(level);
                setListModal(null);
            }} onView={(level) => {
                setViewLevel(level);
                setListModal(null);
            }}/>) : null}

      <div className="flex w-full min-w-0 flex-col gap-6 overflow-x-hidden">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">Membership Levels</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.manage.loyalty.tiers.discount.rates.and.spen")}</p>
          </div>
          <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold" onClick={resetForm} type="button">
            <Plus aria-hidden="true"/>
            New level
          </button>
        </div>

        {message ? (<div className={message.tone === "success"
                ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
                : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"}>
            {message.text}
          </div>) : null}

        <section className="grid min-w-0 gap-4 md:grid-cols-3">
          <Metric label="Total levels" value={String(levels.length)} onClick={() => setListModal("all")}/>
          <Metric label="Active levels" value={String(activeCount)} onClick={() => setListModal("active")}/>
          <Metric label="Referenced levels" value={String(referencedCount)} onClick={() => setListModal("referenced")}/>
        </section>

        <section className="grid w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)]">
          <form className="min-w-0 rounded-lg border border-border bg-card p-5" onSubmit={saveLevel}>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <BadgePercent aria-hidden="true"/>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{form.id ? "Edit level" : "Create level"}</h2>
                <p className="text-sm text-muted-foreground">{t("ui.core.fields.save.to.supabase.preview.fields.")}</p>
              </div>
            </div>

            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Level name">
                <input className="field-input" required value={form.name} onChange={(event) => update("name", event.target.value)}/>
              </Field>
              <Field label="Minimum spend LAK">
                <NumberInput value={form.minSpendLak} onChange={(value) => update("minSpendLak", value)}/>
              </Field>
              <Field label="Discount percent">
                <NumberInput max={100} step="0.01" value={form.discountPercent} onChange={(value) => update("discountPercent", value)}/>
              </Field>
              <Field label="Discount type">
                <select className="field-input" value={form.discountType} onChange={(event) => update("discountType", event.target.value as DiscountType)}>
                  {discountTypeOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
              </Field>
              <Field label="Discount amount LAK">
                <NumberInput value={form.discountAmountLak} onChange={(value) => update("discountAmountLak", value)}/>
              </Field>
              <Field label="Rounding rule">
                <select className="field-input disabled:cursor-not-allowed disabled:opacity-60" disabled={form.discountType !== "percent_rounding"} value={form.roundingRule} onChange={(event) => update("roundingRule", event.target.value as RoundingRule)}>
                  {roundingRuleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
              </Field>
              <Field label="Example bill total LAK">
                <NumberInput value={form.exampleBillTotalLak} onChange={(value) => update("exampleBillTotalLak", value)}/>
              </Field>
              <Field label="Card color">
                <div className="flex min-w-0 gap-2">
                  <input className="h-11 w-14 shrink-0 rounded-md border border-border bg-background p-1" type="color" value={form.cardColor} onChange={(event) => update("cardColor", event.target.value)}/>
                  <input className="field-input min-w-0" value={form.cardColor} onChange={(event) => update("cardColor", event.target.value)}/>
                </div>
              </Field>
              <Field label="Membership duration">
                <select className="field-input" value={form.duration} onChange={(event) => update("duration", event.target.value as DurationOption)}>
                  {durationOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
              </Field>
              <Field label="Welcome bonus points">
                <NumberInput value={form.welcomeBonusPoints} onChange={(value) => update("welcomeBonusPoints", value)}/>
              </Field>
              <Field label="Start date">
                <input className="field-input" type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)}/>
              </Field>
              <Field label="Expiry date">
                <input className="field-input disabled:cursor-not-allowed disabled:opacity-60" disabled={form.duration === "never"} type="date" value={form.expiryDate} onChange={(event) => update("expiryDate", event.target.value)}/>
              </Field>
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-sm font-medium">
                <span>Active <span className="block text-xs font-normal text-muted-foreground">{t("ui.visible.for.customer.assignment")}</span></span>
                <input checked={form.isActive} className="size-4 accent-primary" type="checkbox" onChange={(event) => update("isActive", event.target.checked)}/>
              </label>
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-sm font-medium">
                <span>Auto upgrade <span className="block text-xs font-normal text-muted-foreground">{t("ui.move.customers.up.when.spend.threshold.is.re")}</span></span>
                <input checked={form.autoUpgrade} className="size-4 accent-primary" type="checkbox" onChange={(event) => update("autoUpgrade", event.target.checked)}/>
              </label>
              <Field className="md:col-span-2 xl:col-span-1 2xl:col-span-2" label="Benefits description">
                <textarea className="min-h-24 rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={form.benefitsDescription} onChange={(event) => update("benefitsDescription", event.target.value)} placeholder={t("ui.example.priority.support.special.discounts.b")}/>
              </Field>
            </div>

            <MembershipCardPreview form={form}/>

            <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending || !form.name.trim()} aria-disabled={isPending || !form.name.trim()} type="submit">
              <Save aria-hidden="true"/>
              {isPending ? t("ui.saving") : form.id ? "Save changes" : "Create level"}
            </button>
          </form>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Levels</h2>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
                  <input className="field-input min-w-0 pl-9" placeholder="Search levels" value={query} onChange={(event) => setQuery(event.target.value)}/>
                </label>
                <select className="field-input sm:w-36" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] table-fixed text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-[28%] px-3 py-3">Name</th>
                    <th className="w-[16%] px-3 py-3 text-right">Min spend</th>
                    <th className="w-[13%] px-3 py-3 text-right">Discount</th>
                    <th className="w-[13%] px-3 py-3 text-right">Customers</th>
                    <th className="w-[14%] px-3 py-3">Status</th>
                    <th className="w-[16%] px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLevels.map((level) => (<tr className="border-b border-border last:border-b-0" key={level.id}>
                      <td className="px-3 py-3">
                        <button className="block max-w-full truncate text-left font-medium text-primary underline-offset-4 hover:underline" title={level.name} type="button" onClick={() => setViewLevel(level)}>
                          {level.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">{formatLak(level.minSpendLak)}</td>
                      <td className="px-3 py-3 text-right">{level.discountPercent}%</td>
                      <td className="px-3 py-3 text-right">{level.customerCount}</td>
                      <td className="px-3 py-3">
                        <StatusBadge active={level.isActive}/>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:text-foreground" onClick={() => setViewLevel(level)} type="button" title="View level">
                            <Eye aria-hidden="true" className="size-4"/>
                          </button>
                          <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:text-foreground" onClick={() => editLevel(level)} type="button" title="Edit level">
                            <Edit3 aria-hidden="true" className="size-4"/>
                          </button>
                          <button className="grid size-9 place-items-center rounded-md border border-warning text-warning transition hover:bg-warning/10 disabled:opacity-50" disabled={isPending} onClick={() => level.customerCount + level.promotionCount > 0 ? archiveLevel(level) : deleteLevel(level)} type="button" title="Delete or archive level">
                            <Trash2 aria-hidden="true" className="size-4"/>
                          </button>
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </div>);
}
function Metric({ label, onClick, value }: {
    label: string;
    onClick: () => void;
    value: string;
}) {
    return (<button className="min-w-0 rounded-lg border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={onClick}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
      <div className="mt-2 text-xs font-semibold text-primary">View list</div>
    </button>);
}
function NumberInput({ max, onChange, step, value, }: {
    max?: number;
    onChange: (value: number) => void;
    step?: string;
    value: number;
}) {
    return (<input className="field-input" max={max} min="0" step={step} type="number" value={value} onBlur={(event) => {
            if (event.currentTarget.value.trim() === "")
                onChange(0);
        }} onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))} onFocus={(event) => {
            if (event.currentTarget.value === "0")
                event.currentTarget.value = "";
        }}/>);
}
function Field({ children, className, label }: {
    children: React.ReactNode;
    className?: string;
    label: string;
}) {
    return (<label className={cn("flex min-w-0 flex-col gap-2 text-sm font-medium", className)}>
      {label}
      {children}
    </label>);
}
function StatusBadge({ active }: {
    active: boolean;
}) {
    return (<span className={active ? "rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success" : "rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"}>
      {active ? "Active" : "Inactive"}
    </span>);
}
function MembershipCardPreview({ form }: {
    form: FormState;
}) {
    const discountPreview = calculateMembershipDiscount(form);
    return (<section className="mt-5 rounded-lg border border-border bg-background p-4">
      <div className="text-sm font-semibold">Card preview</div>
      <div className="mt-3 overflow-hidden rounded-lg border border-border text-white" style={{ backgroundColor: form.cardColor }}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold">{form.name || "Level name"}</div>
              <div className="mt-1 text-sm opacity-90">
                {form.discountType === "fixed_amount"
            ? `${formatLak(form.discountAmountLak)} LAK discount`
            : `${form.discountPercent || 0}% discount`}
              </div>
            </div>
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-white/20">
              <QrCode aria-hidden="true"/>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-sm opacity-90">
            {form.benefitsDescription || "Benefits description preview"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-white/20 px-2 py-1">{durationLabels[form.duration]}</span>
            <span className="rounded bg-white/20 px-2 py-1">{form.autoUpgrade ? "Auto upgrade ON" : "Auto upgrade OFF"}</span>
            <span className="rounded bg-white/20 px-2 py-1">{formatLak(form.welcomeBonusPoints)} bonus points</span>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">
        <div className="font-semibold">Discount calculation preview</div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <PreviewLine label="Discount type" value={discountTypeLabels[form.discountType]}/>
          <PreviewLine label="Rounding" value={roundingRuleLabels[form.roundingRule]}/>
          <PreviewLine label="Bill total" value={`${formatLak(discountPreview.billTotal)} LAK`}/>
          <PreviewLine label="Raw discount" value={`${formatLak(discountPreview.rawDiscount)} LAK`}/>
          <PreviewLine label="Final discount" value={`${formatLak(discountPreview.finalDiscount)} LAK`}/>
          <PreviewLine label="Payable" value={`${formatLak(discountPreview.payable)} LAK`}/>
        </div>
      </div>
    </section>);
}
function PreviewLine({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-background px-3 py-2">
      <span>{label}</span>
      <span className="truncate font-semibold text-foreground" title={value}>{value}</span>
    </div>);
}
function LevelListModal({ kind, levels, onClose, onEdit, onView, }: {
    kind: LevelListModalKind;
    levels: MembershipLevelRecord[];
    onClose: () => void;
    onEdit: (level: MembershipLevelRecord) => void;
    onView: (level: MembershipLevelRecord) => void;
}) {
    const title = kind === "active" ? "Active Levels" : kind === "referenced" ? "Referenced Levels" : "All Membership Levels";
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{levels.length} levels</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto p-5">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[680px] table-fixed text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-[30%] px-3 py-3">Level name</th>
                  <th className="w-[18%] px-3 py-3 text-right">Min spend</th>
                  <th className="w-[14%] px-3 py-3 text-right">Discount</th>
                  <th className="w-[14%] px-3 py-3 text-right">Customers</th>
                  <th className="w-[12%] px-3 py-3">Status</th>
                  <th className="w-[12%] px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((level) => (<tr className="border-b border-border last:border-b-0" key={level.id}>
                    <td className="px-3 py-3">
                      <button className="max-w-full truncate font-medium text-primary hover:underline" title={level.name} type="button" onClick={() => onView(level)}>
                        {level.name}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">{formatLak(level.minSpendLak)}</td>
                    <td className="px-3 py-3 text-right">{level.discountPercent}%</td>
                    <td className="px-3 py-3 text-right">{level.customerCount}</td>
                    <td className="px-3 py-3"><StatusBadge active={level.isActive}/></td>
                    <td className="px-3 py-3 text-right">
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => onEdit(level)}>
                        Edit
                      </button>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {levels.length === 0 ? (<div className="rounded-md border border-border bg-background p-6 text-center text-sm text-muted-foreground">{t("ui.no.levels.found")}</div>) : null}
        </div>
      </div>
    </div>);
}
function LevelViewModal({ level, onClose, onEdit }: {
    level: MembershipLevelRecord;
    onClose: () => void;
    onEdit: () => void;
}) {
    const details = getLevelDetails(level);
    const discountPreview = calculateMembershipDiscount({
        discountAmountLak: details.discountAmountLak,
        discountPercent: level.discountPercent,
        discountType: details.discountType,
        exampleBillTotalLak: details.exampleBillTotalLak,
        roundingRule: details.roundingRule,
    });
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold" title={level.name}>{level.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Membership level details</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <Detail label="Level name" value={level.name}/>
          <Detail label="Card color" value={details.cardColor}/>
          <Detail label="Minimum spend" value={`${formatLak(level.minSpendLak)} LAK`}/>
          <Detail label="Discount type" value={discountTypeLabels[details.discountType]}/>
          <Detail label="Discount percent" value={`${level.discountPercent}%`}/>
          <Detail label="Discount amount LAK" value={`${formatLak(details.discountAmountLak)} LAK`}/>
          <Detail label="Rounding rule" value={roundingRuleLabels[details.roundingRule]}/>
          <Detail label="Example final discount" value={`${formatLak(discountPreview.finalDiscount)} LAK`}/>
          <Detail label="Example payable" value={`${formatLak(discountPreview.payable)} LAK`}/>
          <Detail label="Membership duration" value={durationLabels[details.duration]}/>
          <Detail label="Start date" value={formatDate(details.startDate)}/>
          <Detail label="Expiry date" value={details.expiryDate ? formatDate(details.expiryDate) : "Never expire"}/>
          <Detail label="Welcome bonus points" value={formatLak(details.welcomeBonusPoints)}/>
          <Detail label="Benefits description" value={details.benefitsDescription}/>
          <Detail label="Auto upgrade status" value={details.autoUpgrade ? "ON" : "OFF"}/>
          <Detail label="Active status" value={level.isActive ? "Active" : "Inactive"}/>
          <Detail label="Customers in this level" value={String(level.customerCount)}/>
          <Detail label="Created / updated date" value="Not available in current schema"/>
        </dl>
        <button className="mt-5 h-10 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => {
            onEdit();
            onClose();
        }}>
          Edit
        </button>
      </div>
    </div>);
}
function Detail({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>);
}
function pickCardColor(name: string) {
    const normalized = name.toLowerCase();
    if (normalized.includes("platinum"))
        return "#64748b";
    if (normalized.includes("gold"))
        return "#ca8a04";
    if (normalized.includes("silver"))
        return "#94a3b8";
    return "#2563eb";
}
function todayLocalDate() {
    const date = new Date();
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
}
function calculateExpiryDate(startDate: string, duration: DurationOption) {
    const months = durationOptions.find((option) => option.value === duration)?.months ?? 0;
    if (!startDate || months <= 0)
        return "";
    const date = new Date(`${startDate}T00:00:00`);
    date.setMonth(date.getMonth() + months);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
}
function getLevelDetails(level: MembershipLevelRecord) {
    const duration: DurationOption = "never";
    return {
        autoUpgrade: true,
        benefitsDescription: `Benefits for ${level.name} members.`,
        cardColor: pickCardColor(level.name),
        discountAmountLak: 0,
        discountType: "percent" as DiscountType,
        duration,
        exampleBillTotalLak: 25000,
        expiryDate: "",
        roundingRule: "none" as RoundingRule,
        startDate: todayLocalDate(),
        welcomeBonusPoints: 0,
    };
}
function calculateMembershipDiscount(input: Pick<FormState, "discountAmountLak" | "discountPercent" | "discountType" | "exampleBillTotalLak" | "roundingRule">) {
    const billTotal = Math.max(0, input.exampleBillTotalLak);
    const rawDiscount = input.discountType === "fixed_amount"
        ? Math.max(0, input.discountAmountLak)
        : Math.max(0, billTotal * (input.discountPercent / 100));
    const roundedDiscount = input.discountType === "percent_rounding"
        ? applyRoundingRule(rawDiscount, input.roundingRule)
        : rawDiscount;
    const finalDiscount = Math.min(Math.max(0, roundedDiscount), billTotal);
    const payable = Math.max(0, billTotal - finalDiscount);
    return {
        billTotal: Math.round(billTotal),
        finalDiscount: Math.round(finalDiscount),
        payable: Math.round(payable),
        rawDiscount: Math.round(rawDiscount),
    };
}
function applyRoundingRule(value: number, rule: RoundingRule) {
    if (rule === "none")
        return value;
    const step = rule.endsWith("1000") ? 1000 : 500;
    if (rule.startsWith("down"))
        return Math.floor(value / step) * step;
    if (rule.startsWith("up"))
        return Math.ceil(value / step) * step;
    return Math.round(value / step) * step;
}
function getLevelsForModal(kind: LevelListModalKind, levels: MembershipLevelRecord[]) {
    if (kind === "active")
        return levels.filter((level) => level.isActive);
    if (kind === "referenced")
        return levels.filter((level) => level.customerCount > 0);
    return levels;
}
function formatDate(value: string) {
    if (!value)
        return "--";
    const [year, month, day] = value.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!year || !month || !day)
        return value;
    return `${day} ${months[month - 1]} ${year}`;
}
