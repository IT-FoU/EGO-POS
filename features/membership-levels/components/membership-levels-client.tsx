"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import {
  fillMembershipsCopy,
  localizeMembershipError,
  tMemberships,
  type MembershipsCopyKey,
} from "@/lib/i18n/memberships-copy";
import {
  BadgePercent,
  Edit3,
  Eye,
  Filter,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  archiveMembershipLevelAction,
  createMembershipLevelAction,
  deleteMembershipLevelAction,
  updateMembershipLevelAction,
} from "@/features/membership-levels/actions";
import type { MembershipLevelRecord } from "@/features/membership-levels/types";
import { cn } from "@/lib/utils";

type Drawer =
  | { type: "create" }
  | { type: "edit"; level: MembershipLevelRecord }
  | { type: "view"; level: MembershipLevelRecord }
  | { type: "filters" }
  | null;

type FormState = {
  discountPercent: number;
  id?: string;
  isActive: boolean;
  minSpendLak: number;
  name: string;
};

const emptyForm: FormState = {
  discountPercent: 0,
  isActive: true,
  minSpendLak: 0,
  name: "",
};

const MembershipsLocaleContext = createContext<SupportedLocale>("en");

function useCopy() {
  const locale = useContext(MembershipsLocaleContext);
  return (key: MembershipsCopyKey) => tMemberships(key, locale);
}

function useMembershipsLocale() {
  return useContext(MembershipsLocaleContext);
}

function formatLak(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function MembershipLevelsClient({
  levels,
  locale: localeProp,
}: {
  levels: MembershipLevelRecord[];
  locale?: SupportedLocale;
}) {
  const locale = useAppLocale(localeProp);

  return (
    <MembershipsLocaleContext.Provider value={locale}>
      <MembershipLevelsView levels={levels} />
    </MembershipsLocaleContext.Provider>
  );
}

function MembershipLevelsView({ levels }: { levels: MembershipLevelRecord[] }) {
  const copy = useCopy();
  const locale = useMembershipsLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const filteredLevels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return levels.filter((level) => {
      const matchesQuery =
        !normalizedQuery ||
        [level.name, String(level.discountPercent), level.isActive ? "active" : "inactive"]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? level.isActive : !level.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [levels, query, statusFilter]);

  const activeLevels = levels.filter((level) => level.isActive);
  const inactiveLevels = levels.filter((level) => !level.isActive);
  const customerCount = levels.reduce((total, level) => total + level.customerCount, 0);
  const highestDiscount = levels.reduce((max, level) => Math.max(max, level.discountPercent), 0);
  const activeFilterCount = Number(statusFilter !== "all");

  function openCreateDrawer() {
    setForm(emptyForm);
    setMessage(null);
    setDrawer({ type: "create" });
  }

  function openEditDrawer(level: MembershipLevelRecord) {
    setForm(levelToForm(level));
    setMessage(null);
    setOpenMenuId(null);
    setDrawer({ type: "edit", level });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.name.trim()) return copy("nameRequired");
    if (form.minSpendLak < 0) return copy("minSpendNegative");
    if (form.discountPercent < 0 || form.discountPercent > 100) {
      return copy("discountRange");
    }
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
      const result = form.id ? await updateMembershipLevelAction(form.id, payload) : await createMembershipLevelAction(payload);
      if (!result.ok) {
        setMessage({ text: localizeMembershipError(result.error ?? copy("saveFailed"), locale), tone: "error" });
        return;
      }

      setMessage({
        text: form.id ? copy("updated") : copy("created"),
        tone: "success",
      });
      setForm(emptyForm);
      setDrawer(null);
      router.refresh();
    });
  }

  function archiveLevel(level: MembershipLevelRecord) {
    if (!window.confirm(copy("archiveConfirm"))) return;
    setOpenMenuId(null);
    setMessage(null);
    startTransition(async () => {
      const result = await archiveMembershipLevelAction(level.id);
      if (!result.ok) {
        setMessage({ text: localizeMembershipError(result.error ?? copy("archiveFailed"), locale), tone: "error" });
        return;
      }
      setMessage({ text: copy("archived"), tone: "success" });
      router.refresh();
    });
  }

  function deleteLevel(level: MembershipLevelRecord) {
    if (!window.confirm(copy("deleteConfirm"))) return;
    setOpenMenuId(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMembershipLevelAction(level.id);
      if (!result.ok) {
        setMessage({ text: localizeMembershipError(result.error ?? copy("deleteFailed"), locale), tone: "error" });
        return;
      }
      setMessage({ text: copy("deletedOrArchived"), tone: "success" });
      router.refresh();
    });
  }

  function clearFilters() {
    setStatusFilter("all");
    setDrawer(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold">{copy("membership")}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy("subtitle")}
        </p>
      </header>

      {message ? (
        <div
          className={
            message.tone === "success"
              ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
        >
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={BadgePercent} label={copy("activeLevels")} value={String(activeLevels.length)} onClick={() => setStatusFilter("active")} />
        <KpiCard icon={Users} label={copy("customersInLevels")} value={formatLak(customerCount)} />
        <KpiCard icon={BadgePercent} label={copy("inactiveLevels")} value={String(inactiveLevels.length)} onClick={() => setStatusFilter("inactive")} />
        <KpiCard icon={BadgePercent} label={copy("highestDiscount")} value={`${formatLak(highestDiscount)}%`} />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{copy("membershipLevels")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy("loyaltyNote")}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 lg:w-72 lg:flex-none">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="field-input pl-9"
                placeholder={copy("searchLevels")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setDrawer({ type: "filters" })}>
              <Filter aria-hidden="true" className="size-4" />
              {copy("filters")}
              {activeFilterCount ? <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">{activeFilterCount}</span> : null}
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={openCreateDrawer}>
              <Plus aria-hidden="true" className="size-4" />
              {copy("createLevel")}
            </button>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-[30%] px-4 py-3">{copy("levelName")}</th>
                <th className="w-[18%] px-4 py-3 text-right">{copy("minimumSpend")}</th>
                <th className="w-[16%] px-4 py-3 text-right">{copy("discountPercent")}</th>
                <th className="w-[14%] px-4 py-3 text-right">{copy("customers")}</th>
                <th className="w-[12%] px-4 py-3">{copy("status")}</th>
                <th className="w-[10%] px-4 py-3 text-right">{copy("action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLevels.length ? (
                filteredLevels.map((level) => (
                  <tr className="align-middle transition hover:bg-muted/40" key={level.id}>
                    <td className="px-4 py-3">
                      <button className="max-w-full truncate font-semibold text-primary hover:underline" title={level.name} type="button" onClick={() => setDrawer({ type: "view", level })}>
                        {level.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">{formatLak(level.minSpendLak)} LAK</td>
                    <td className="px-4 py-3 text-right">{formatLak(level.discountPercent)}%</td>
                    <td className="px-4 py-3 text-right">{formatLak(level.customerCount)}</td>
                    <td className="px-4 py-3"><StatusBadge active={level.isActive} /></td>
                    <td className="relative px-4 py-3 text-right">
                      <button
                        className="inline-grid size-9 place-items-center rounded-md border border-border transition hover:border-primary"
                        type="button"
                        onClick={() => setOpenMenuId((current) => (current === level.id ? null : level.id))}
                        aria-label={fillMembershipsCopy(copy("openActions"), { name: level.name })}
                      >
                        <MoreHorizontal aria-hidden="true" className="size-4" />
                      </button>
                      {openMenuId === level.id ? (
                        <div className="absolute right-4 top-12 z-10 w-44 rounded-md border border-border bg-card p-1 text-left shadow-xl">
                          <MenuButton icon={Eye} label={copy("view")} onClick={() => {
                            setOpenMenuId(null);
                            setDrawer({ type: "view", level });
                          }} />
                          <MenuButton icon={Edit3} label={copy("edit")} onClick={() => openEditDrawer(level)} />
                          {level.isActive ? <MenuButton icon={Trash2} label={copy("archive")} onClick={() => archiveLevel(level)} /> : null}
                          <MenuButton icon={Trash2} label={copy("delete")} onClick={() => deleteLevel(level)} tone="danger" />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                    {copy("noLevelsFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drawer?.type === "create" || drawer?.type === "edit" ? (
        <WideDrawer title={drawer.type === "create" ? copy("createLevel") : copy("editLevel")} onClose={() => setDrawer(null)}>
          <LevelForm form={form} isPending={isPending} onCancel={() => setDrawer(null)} onSave={saveLevel} onUpdate={update} />
        </WideDrawer>
      ) : null}

      {drawer?.type === "view" ? (
        <WideDrawer title={drawer.level.name} onClose={() => setDrawer(null)}>
          <LevelDetails level={drawer.level} onEdit={() => openEditDrawer(drawer.level)} />
        </WideDrawer>
      ) : null}

      {drawer?.type === "filters" ? (
        <WideDrawer title={copy("filters")} onClose={() => setDrawer(null)}>
          <div className="mx-auto grid w-full max-w-3xl gap-4">
            <FormSection title={copy("status")}>
              <SegmentedControl
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: copy("all"), value: "all" },
                  { label: copy("active"), value: "active" },
                  { label: copy("inactive"), value: "inactive" },
                ]}
              />
            </FormSection>
            <div className="flex justify-end">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={clearFilters}>
                {copy("clearFilters")}
              </button>
            </div>
          </div>
        </WideDrawer>
      ) : null}
    </div>
  );
}

function LevelForm({
  form,
  isPending,
  onCancel,
  onSave,
  onUpdate,
}: {
  form: FormState;
  isPending: boolean;
  onCancel: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  const copy = useCopy();
  return (
    <form className="flex min-h-full flex-col" onSubmit={onSave}>
      <div className="mx-auto grid w-full max-w-4xl flex-1 gap-5 pb-28">
        <FormSection title={copy("levelInformation")}>
          <Field label={copy("levelName")}>
            <input className="field-input" required value={form.name} onChange={(event) => onUpdate("name", event.target.value)} />
          </Field>
          <Field label={copy("status")}>
            <select className="field-input" value={form.isActive ? "active" : "inactive"} onChange={(event) => onUpdate("isActive", event.target.value === "active")}>
              <option value="active">{copy("active")}</option>
              <option value="inactive">{copy("inactive")}</option>
            </select>
          </Field>
        </FormSection>

        <FormSection title={copy("membershipRules")} description={copy("membershipRulesNote")}>
          <Field label={`${copy("minimumSpend")} LAK`}>
            <NumberInput value={form.minSpendLak} onChange={(value) => onUpdate("minSpendLak", value)} />
          </Field>
          <Field label={copy("discountPercent")}>
            <NumberInput max={100} step="0.01" value={form.discountPercent} onChange={(value) => onUpdate("discountPercent", value)} />
          </Field>
        </FormSection>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          {copy("futureRulesNote")}
        </div>
      </div>

      <footer className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-background/95 px-5 py-4 backdrop-blur">
        <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onCancel}>
          {copy("cancel")}
        </button>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending || !form.name.trim()} type="submit">
          <Save aria-hidden="true" className="size-4" />
          {isPending ? copy("saving") : form.id ? copy("saveLevel") : copy("createLevel")}
        </button>
      </footer>
    </form>
  );
}

function LevelDetails({ level, onEdit }: { level: MembershipLevelRecord; onEdit: () => void }) {
  const copy = useCopy();
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <InfoGrid
        rows={[
          [copy("levelName"), level.name],
          [copy("minimumSpend"), `${formatLak(level.minSpendLak)} LAK`],
          [copy("discountPercent"), `${formatLak(level.discountPercent)}%`],
          [copy("customers"), String(level.customerCount)],
          [copy("promotions"), String(level.promotionCount)],
          [copy("status"), level.isActive ? copy("active") : copy("inactive")],
        ]}
      />
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        {copy("posDiscountNote")}
      </div>
      <div className="flex justify-end">
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onEdit}>
          <Edit3 aria-hidden="true" className="size-4" />
          {copy("editLevel")}
        </button>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, onClick, value }: { icon: typeof BadgePercent; label: string; onClick?: () => void; value: string }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      className="min-w-0 rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/5"
      type={onClick ? "button" : undefined}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
        <Icon aria-hidden="true" className="size-4 text-primary" />
      </div>
      <div className="mt-2 truncate text-2xl font-semibold">{value}</div>
    </Component>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const copy = useCopy();
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        active ? "border-success/30 bg-success/10 text-success" : "border-muted-foreground/30 bg-muted text-muted-foreground",
      )}
    >
      {active ? copy("active") : copy("inactive")}
    </span>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  tone?: "danger" | "default";
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-medium transition hover:bg-muted",
        tone === "danger" ? "text-danger" : "text-foreground",
      )}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function WideDrawer({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const copy = useCopy();
  return (
    <div className="fixed inset-y-0 left-0 right-0 z-50 flex justify-end overflow-x-hidden bg-black/45 lg:left-72">
      <section className="flex h-full w-full max-w-5xl flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <button className="mb-1 text-xs font-semibold text-muted-foreground transition hover:text-primary" type="button" onClick={onClose}>
              {copy("backToMembership")}
            </button>
            <h2 className="truncate text-lg font-semibold">{title}</h2>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

function FormSection({ children, description, title }: { children: React.ReactNode; description?: string; title: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ max, onChange, step = "1", value }: { max?: number; onChange: (value: number) => void; step?: string; value: number }) {
  return (
    <input
      className="field-input text-right"
      max={max}
      min={0}
      step={step}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          className={cn(
            "h-10 rounded-md border px-4 text-sm font-semibold transition",
            option.value === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary",
          )}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="rounded-lg border border-border bg-card p-4" key={label}>
          <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function levelToForm(level: MembershipLevelRecord): FormState {
  return {
    discountPercent: level.discountPercent,
    id: level.id,
    isActive: level.isActive,
    minSpendLak: level.minSpendLak,
    name: level.name,
  };
}
