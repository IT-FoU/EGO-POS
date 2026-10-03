"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Plus, ShieldCheck, type LucideIcon } from "lucide-react";
import {
  decideApprovalAction,
  deactivateStaffMemberAction,
  reactivateStaffMemberAction,
  saveApprovalRuleAction,
  saveStaffCreateDefaultAction,
  saveStaffMemberAction,
} from "@/features/access-control/actions";
import { APPROVAL_RULE_LABELS } from "@/features/access-control/permission-catalog";
import { isAssignableStaffRole, NEW_STAFF_DEFAULTS, validateStaffAccountInput } from "@/features/access-control/staff-account";
import { previewStaffAccess, recommendedStaffSetup, type StaffCreateDefaults } from "@/features/access-control/staff-create-defaults";
import { readStaffLastUsed, writeStaffLastUsed } from "@/features/access-control/staff-presets";
import type { StaffAccessSnapshot, StaffMemberRecord } from "@/features/access-control/types";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import type { SupportedLocale } from "@/lib/constants";
import { fillSettingsCopy, localizeApprovalRule, localizePermissionModule, localizeRoleTemplate, localizeSettingsError, localizeStaffStatus, tSettings } from "@/lib/i18n/settings-copy";
import { RolePermissionsPanel } from "@/features/settings/components/role-permissions-panel";
import { SettingsLargeDrawer } from "@/features/settings/components/settings-large-drawer";

type StaffPresetChoice = "cashier" | "custom" | "last-used" | "manager";

type StaffDraft = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  assignedTerminal: string;
  branchId: string;
  confirmPassword: string;
  fullName: string;
  id?: string;
  password: string;
  requirePasswordChange: boolean;
  roleId: string;
  status: "active" | "disabled";
  username: string;
};

function roleOptionSummary(template: StaffAccessSnapshot["roles"][number]["templateKey"], locale: SupportedLocale) {
  if (template === "Manager") return `${tSettings("backOfficeAccessSummary", locale)} · ${tSettings("broaderPermissions", locale)}`;
  if (template === "Staff/Cashier") return `${tSettings("posFocused", locale)} · ${tSettings("limitedBackOffice", locale)}`;
  return tSettings("customAccess", locale);
}

function emptyStaffDraft(branches: StaffAccessSnapshot["branches"], roles: StaffAccessSnapshot["roles"]): StaffDraft {
  const assignable = roles.filter((role) => isAssignableStaffRole(role));
  const cashierRole = assignable.find((role) => role.templateKey === "Staff/Cashier") ?? assignable[0];
  return {
    allowBackOfficeAccess: NEW_STAFF_DEFAULTS.allowBackOfficeAccess,
    allowPosAccess: NEW_STAFF_DEFAULTS.allowPosAccess,
    assignedTerminal: NEW_STAFF_DEFAULTS.assignedTerminal,
    branchId: branches[0]?.id ?? "",
    confirmPassword: "",
    fullName: "",
    password: "",
    requirePasswordChange: NEW_STAFF_DEFAULTS.requirePasswordChange,
    roleId: cashierRole?.id ?? "",
    status: NEW_STAFF_DEFAULTS.status,
    username: "",
  };
}

function defaultsFromSnapshot(snapshot: StaffAccessSnapshot): StaffCreateDefaults {
  return snapshot.staffCreateDefaults ?? {
    cashier: recommendedStaffSetup("cashier", snapshot.branches),
    manager: recommendedStaffSetup("manager", snapshot.branches),
  };
}

function validBranchId(branchId: string, branches: StaffAccessSnapshot["branches"], fallback: string) {
  return branches.some((branch) => branch.id === branchId) ? branchId : fallback;
}

export function StaffControlSection({
  actorIsOwner = false,
  actorUserId,
  initialSnapshot,
  locale,
  section,
  onNotify,
}: {
  actorIsOwner?: boolean;
  actorUserId?: string;
  initialSnapshot: StaffAccessSnapshot;
  locale: SupportedLocale;
  section: "staff" | "roles" | "approval-rules";
  onNotify: (message: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [staff, setStaff] = useState(initialSnapshot.staff);
  const [approvalRules, setApprovalRules] = useState(initialSnapshot.approvalRules);
  const [pendingApprovals, setPendingApprovals] = useState(initialSnapshot.pendingApprovals);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffStatusFilter, setStaffStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [staffBranchFilter, setStaffBranchFilter] = useState("all");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffDraft>(() => emptyStaffDraft(initialSnapshot.branches, initialSnapshot.roles));
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [confirmReactivateId, setConfirmReactivateId] = useState<string | null>(null);
  const [confirmApprovalRule, setConfirmApprovalRule] = useState<keyof typeof APPROVAL_RULE_LABELS | null>(null);
  const [staffPreset, setStaffPreset] = useState<StaffPresetChoice>("cashier");
  const [createDefaults, setCreateDefaults] = useState<StaffCreateDefaults>(() => defaultsFromSnapshot(initialSnapshot));
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);
  const [resetKind, setResetKind] = useState<"cashier" | "manager" | null>(null);
  const presetRadioRef = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    setStaff(initialSnapshot.staff);
    setApprovalRules(initialSnapshot.approvalRules);
    setPendingApprovals(initialSnapshot.pendingApprovals);
    setCreateDefaults(defaultsFromSnapshot(initialSnapshot));
  }, [initialSnapshot]);

  const assignableRoles = initialSnapshot.roles.filter((entry) => isAssignableStaffRole(entry));
  const filteredStaff = staff.filter((member) => {
    if (staffStatusFilter !== "all" && member.status !== staffStatusFilter) return false;
    if (staffRoleFilter !== "all" && member.roleId !== staffRoleFilter) return false;
    if (staffBranchFilter !== "all" && member.branchId !== staffBranchFilter) return false;
    const needle = staffQuery.trim().toLowerCase();
    if (!needle) return true;
    return [
      member.fullName,
      member.username,
      member.roleName,
      localizeRoleTemplate(member.roleName, locale),
      member.branchName,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const editingSelf = Boolean(editingStaffId && actorUserId && staff.find((member) => member.id === editingStaffId)?.userId === actorUserId);
  const deactivateTarget = staff.find((member) => member.id === confirmDeactivateId);
  const reactivateTarget = staff.find((member) => member.id === confirmReactivateId);

  function runMutation(action: () => Promise<{ error?: string; ok: boolean }>, successMessage: string) {
    onNotify(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
        return;
      }
      onNotify({ text: successMessage, tone: "success" });
      router.refresh();
    });
  }

  function saveRule(ruleKey: keyof typeof APPROVAL_RULE_LABELS) {
    if (!approvalRules.find((rule) => rule.ruleKey === ruleKey)) return;
    setConfirmApprovalRule(ruleKey);
  }

  function commitSaveRule(ruleKey: keyof typeof APPROVAL_RULE_LABELS) {
    const existing = approvalRules.find((rule) => rule.ruleKey === ruleKey);
    if (!existing) return;
    setConfirmApprovalRule(null);
    runMutation(
      () =>
        saveApprovalRuleAction({
          approverRole: existing.approverRole,
          isEnabled: existing.isEnabled,
          ruleKey,
          thresholdLak: existing.thresholdLak,
          thresholdPercent: existing.thresholdPercent,
        }),
      fillSettingsCopy(tSettings("approvalRuleSaved", locale), { rule: localizeApprovalRule(ruleKey, locale) }),
    );
  }

  function openAddStaff() {
    const defaults = defaultsFromSnapshot(initialSnapshot);
    setEditingStaffId(null);
    setStaffPreset("cashier");
    setStaffFormError(null);
    setCreateDefaults(defaults);
    setStaffDraft(draftFromKind("cashier", emptyStaffDraft(initialSnapshot.branches, initialSnapshot.roles), defaults));
    setStaffModalOpen(true);
  }

  function openEditStaff(memberId: string) {
    const member = staff.find((item) => item.id === memberId);
    if (!member || member.isOwner) return;
    setEditingStaffId(member.id);
    setStaffDraft({
      allowBackOfficeAccess: member.allowBackOfficeAccess,
      allowPosAccess: member.allowPosAccess,
      assignedTerminal: member.assignedTerminal,
      branchId: member.branchId,
      confirmPassword: "",
      fullName: member.fullName,
      id: member.id,
      password: "",
      requirePasswordChange: member.requirePasswordChange,
      roleId: member.roleId,
      status: member.status,
      username: member.username,
    });
    setStaffModalOpen(true);
  }

  useEffect(() => {
    if (!staffModalOpen) return;
    if (editingStaffId) nameInputRef.current?.focus();
    else presetRadioRef.current?.focus();
  }, [staffModalOpen, editingStaffId]);

  function saveStaff() {
    if (isPending || submitLock.current) return;
    setStaffFormError(null);
    if (!staffDraft.roleId) {
      setStaffFormError(tSettings("staffRoleRequired", locale));
      return;
    }
    if (!staffDraft.branchId || !initialSnapshot.branches.some((branch) => branch.id === staffDraft.branchId)) {
      setStaffFormError(tSettings("branchRequired", locale));
      return;
    }
    try {
      validateStaffAccountInput({
        fullName: staffDraft.fullName,
        password: staffDraft.password,
        passwordRequired: !editingStaffId,
        username: staffDraft.username,
      });
    } catch (error) {
      setStaffDraft((current) => ({ ...current, confirmPassword: "", password: "" }));
      setStaffFormError(localizeSettingsError(error instanceof Error ? error.message : "", locale));
      return;
    }
    if (staffDraft.password && staffDraft.password !== staffDraft.confirmPassword) {
      setStaffDraft((current) => ({ ...current, confirmPassword: "", password: "" }));
      setStaffFormError(tSettings("passwordsDoNotMatch", locale));
      return;
    }
    submitLock.current = true;
    const creating = !editingStaffId;
    const payload = {
      allowBackOfficeAccess: staffDraft.allowBackOfficeAccess,
      allowPosAccess: staffDraft.allowPosAccess,
      assignedTerminal: staffDraft.assignedTerminal,
      branchId: staffDraft.branchId,
      fullName: staffDraft.fullName.trim(),
      id: editingStaffId ?? undefined,
      password: staffDraft.password || undefined,
      requirePasswordChange: staffDraft.requirePasswordChange,
      roleId: staffDraft.roleId,
      status: staffDraft.status,
      username: staffDraft.username.trim(),
    };
    const lastUsedPreset = {
      allowBackOfficeAccess: staffDraft.allowBackOfficeAccess,
      allowPosAccess: staffDraft.allowPosAccess,
      branchId: staffDraft.branchId,
      companyId: initialSnapshot.companyId ?? "",
      roleId: staffDraft.roleId,
    };
    startTransition(async () => {
      try {
      const result = await saveStaffMemberAction(payload);
      if (!result.ok) {
        setStaffDraft((current) => ({ ...current, confirmPassword: "", password: "" }));
        setStaffFormError(localizeSettingsError(result.error, locale));
        return;
      }
      if (creating) writeStaffLastUsed(lastUsedPreset);
      const success = creating ? tSettings("staffCreated", locale) : tSettings("staffUpdated", locale);
      setStaffNotice(success);
      onNotify({ text: success, tone: "success" });
      setStaffModalOpen(false);
      setStaffPreset("cashier");
      setStaffDraft(draftFromKind("cashier", emptyStaffDraft(initialSnapshot.branches, initialSnapshot.roles), createDefaults));
      router.refresh();
      } finally {
        submitLock.current = false;
      }
    });
  }

  function disableStaff(memberId: string) {
    setConfirmDeactivateId(memberId);
  }

  function commitDisableStaff(memberId: string) {
    setConfirmDeactivateId(null);
    runMutation(() => deactivateStaffMemberAction(memberId), tSettings("staffDeactivated", locale));
  }

  function commitReactivateStaff(memberId: string) {
    setConfirmReactivateId(null);
    runMutation(() => reactivateStaffMemberAction(memberId), tSettings("staffReactivated", locale));
  }

  function branchLabel(member: Pick<StaffMemberRecord, "branchName">) {
    return member.branchName.trim() ? member.branchName : tSettings("unknownBranch", locale);
  }

  function draftFromKind(kind: "cashier" | "manager", current: StaffDraft, defaults: StaffCreateDefaults): StaffDraft {
    const template = kind === "cashier" ? "Staff/Cashier" : "Manager";
    const role = initialSnapshot.roles.find((entry) => isAssignableStaffRole(entry) && entry.templateKey === template);
    const setup = defaults[kind];
    return {
      ...current,
      allowBackOfficeAccess: setup.allowBackOfficeAccess,
      allowPosAccess: setup.allowPosAccess,
      branchId: validBranchId(setup.branchId, initialSnapshot.branches, initialSnapshot.branches[0]?.id ?? current.branchId),
      roleId: role?.id ?? current.roleId,
    };
  }

  function applyNamedPreset(kind: "cashier" | "manager") {
    const template = kind === "cashier" ? "Staff/Cashier" : "Manager";
    const role = assignableRoles.find((entry) => entry.templateKey === template);
    setStaffFormError(role ? null : tSettings("staffRoleRequired", locale));
    setStaffPreset(kind);
    setStaffDraft((current) => draftFromKind(kind, current, createDefaults));
  }

  function applyLastUsedPreset() {
    const stored = readStaffLastUsed(initialSnapshot.companyId ?? "");
    setStaffPreset("last-used");
    if (!stored) {
      setStaffFormError(tSettings("noLastUsedOnDevice", locale));
      return;
    }
    const roleStillExists = assignableRoles.some((role) => role.id === stored.roleId);
    setStaffFormError(null);
    setStaffDraft((current) => ({
      ...current,
      allowBackOfficeAccess: stored.allowBackOfficeAccess,
      allowPosAccess: stored.allowPosAccess,
      branchId: validBranchId(stored.branchId, initialSnapshot.branches, current.branchId),
      roleId: roleStillExists ? stored.roleId : current.roleId,
    }));
  }

  function choosePreset(choice: StaffPresetChoice) {
    if (choice === "cashier" || choice === "manager") {
      applyNamedPreset(choice);
      return;
    }
    if (choice === "last-used") {
      applyLastUsedPreset();
      return;
    }
    setStaffFormError(null);
    setStaffPreset("custom");
  }

  function markCustom(patch: Partial<StaffDraft>) {
    setStaffDraft((current) => ({ ...current, ...patch }));
    if (!editingStaffId) setStaffPreset("custom");
  }

  function applySelectedRoleDefault() {
    const role = assignableRoles.find((entry) => entry.id === staffDraft.roleId);
    if (role?.templateKey === "Staff/Cashier") applyNamedPreset("cashier");
    if (role?.templateKey === "Manager") applyNamedPreset("manager");
  }

  function saveCreateDefault(kind: "cashier" | "manager") {
    if (!actorIsOwner || isPending) return;
    setStaffFormError(null);
    startTransition(async () => {
      const result = await saveStaffCreateDefaultAction({
        allowBackOfficeAccess: staffDraft.allowBackOfficeAccess,
        allowPosAccess: staffDraft.allowPosAccess,
        branchId: staffDraft.branchId,
        kind,
        reset: false,
      });
      if (!result.ok || !result.data) {
        setStaffFormError(localizeSettingsError(result.error, locale));
        return;
      }
      setCreateDefaults(result.data);
      setStaffNotice(tSettings("staffDefaultSaved", locale));
      onNotify({ text: tSettings("staffDefaultSaved", locale), tone: "success" });
    });
  }

  function commitResetDefault() {
    if (!resetKind || isPending) return;
    const kind = resetKind;
    setResetKind(null);
    startTransition(async () => {
      const result = await saveStaffCreateDefaultAction({
        allowBackOfficeAccess: kind === "manager",
        allowPosAccess: true,
        branchId: initialSnapshot.branches[0]?.id ?? "",
        kind,
        reset: true,
      });
      if (!result.ok || !result.data) {
        setStaffFormError(localizeSettingsError(result.error, locale));
        return;
      }
      const savedDefaults = result.data;
      setCreateDefaults(savedDefaults);
      if (staffPreset === kind) {
        setStaffDraft((draft) => draftFromKind(kind, draft, savedDefaults));
      }
      setStaffNotice(tSettings("staffDefaultReset", locale));
      onNotify({ text: tSettings("staffDefaultReset", locale), tone: "success" });
    });
  }

  function decideApproval(approvalId: string, status: "approved" | "rejected") {
    runMutation(() => decideApprovalAction({ approvalId, status }), status === "approved" ? tSettings("approvalApproved", locale) : tSettings("approvalRejected", locale));
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={ShieldCheck} title={tSettings("staffControl", locale)} />
      <div className="mt-5 grid gap-4">
        {section === "approval-rules" ? (
        <aside className="rounded-lg border border-border bg-background p-4">
          <div className="mt-4 grid gap-3">
            {(Object.keys(APPROVAL_RULE_LABELS) as Array<keyof typeof APPROVAL_RULE_LABELS>).map((ruleKey) => {
              const rule = approvalRules.find((entry) => entry.ruleKey === ruleKey);
              return (
                <div className="rounded-md border border-border bg-card p-3" key={ruleKey}>
                  <div className="text-xs font-semibold">{localizeApprovalRule(ruleKey, locale)}</div>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input checked={rule?.isEnabled ?? true} className="size-4 accent-primary" type="checkbox" onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, isEnabled: event.target.checked } : entry))} />
                    {tSettings("enabled", locale)}
                  </label>
                  <select className="field-input mt-2 h-9 text-xs" value={rule?.approverRole ?? "owner"} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, approverRole: event.target.value } : entry))}>
                    <option value="manager">{tSettings("managerApproval", locale)}</option>
                    <option value="owner">{tSettings("ownerApproval", locale)}</option>
                  </select>
                  {ruleKey === "discount" ? (
                    <label className="mt-2 grid gap-1 text-xs">
                      <span className="font-medium">{tSettings("thresholdPercent", locale)}</span>
                      <input className="field-input h-9 text-xs" min="0" type="number" value={rule?.thresholdPercent ?? 10} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, thresholdPercent: Number(event.target.value) } : entry))} />
                    </label>
                  ) : null}
                  {ruleKey === "refund" || ruleKey === "purchasing" ? (
                    <label className="mt-2 grid gap-1 text-xs">
                      <span className="font-medium">{tSettings("thresholdLak", locale)}</span>
                      <input className="field-input h-9 text-xs" min="0" type="number" value={rule?.thresholdLak ?? 100000} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, thresholdLak: Number(event.target.value) } : entry))} />
                    </label>
                  ) : null}
                  <button className="mt-2 h-8 w-full rounded-md border border-border text-xs font-semibold" disabled={isPending} type="button" onClick={() => saveRule(ruleKey)}>
                    {tSettings("saveRule", locale)}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
        ) : null}

        <div className="min-w-0">
          {section === "staff" ? (
          <section className="mb-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{tSettings("staff", locale)}</h3>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input aria-label={tSettings("searchStaff", locale)} className="field-input h-10 sm:w-64" placeholder={tSettings("searchStaff", locale)} value={staffQuery} onChange={(event) => setStaffQuery(event.target.value)} />
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={openAddStaff}>
                  <Plus className="size-4" aria-hidden="true" />
                  {tSettings("addStaff", locale)}
                </button>
              </div>
            </div>
            {staffNotice ? (
              <p className="mt-3 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-foreground" role="status">{staffNotice}</p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <select aria-label={tSettings("status", locale)} className="field-input h-10" value={staffStatusFilter} onChange={(event) => setStaffStatusFilter(event.target.value as "all" | "active" | "disabled")}>
                <option value="all">{tSettings("allStatuses", locale)}</option>
                <option value="active">{tSettings("active", locale)}</option>
                <option value="disabled">{tSettings("disabled", locale)}</option>
              </select>
              <select aria-label={tSettings("role", locale)} className="field-input h-10" value={staffRoleFilter} onChange={(event) => setStaffRoleFilter(event.target.value)}>
                <option value="all">{tSettings("allRoles", locale)}</option>
                {initialSnapshot.roles.map((entry) => <option key={entry.id} value={entry.id}>{localizeRoleTemplate(entry.name, locale)}</option>)}
              </select>
              <select aria-label={tSettings("branch", locale)} className="field-input h-10" value={staffBranchFilter} onChange={(event) => setStaffBranchFilter(event.target.value)}>
                <option value="all">{tSettings("allBranches", locale)}</option>
                {initialSnapshot.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">{tSettings("staff", locale)}</th>
                    <th className="px-3 py-3">{tSettings("username", locale)}</th>
                    <th className="px-3 py-3">{tSettings("role", locale)}</th>
                    <th className="px-3 py-3">{tSettings("branch", locale)}</th>
                    <th className="px-3 py-3">{tSettings("access", locale)}</th>
                    <th className="px-3 py-3">{tSettings("status", locale)}</th>
                    <th className="px-3 py-3">{tSettings("actions", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr className="border-b border-border last:border-b-0" key={member.id}>
                      <td className="px-3 py-3 font-semibold">{member.fullName}</td>
                      <td className="px-3 py-3 font-mono text-xs">{member.username}</td>
                      <td className="px-3 py-3">{localizeRoleTemplate(member.roleName, locale)}</td>
                      <td className="px-3 py-3">{branchLabel(member)}</td>
                      <td className="px-3 py-3"><AccessMarks locale={locale} member={member} /></td>
                      <td className="px-3 py-3"><StatusBadge locale={locale} member={member} /></td>
                      <td className="px-3 py-3"><StaffActions locale={locale} member={member} onDeactivate={disableStaff} onEdit={openEditStaff} onReactivate={setConfirmReactivateId} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 md:hidden">
              {filteredStaff.map((member) => (
                <article className="rounded-lg border border-border bg-card p-3" key={member.id}>
                  <div className="font-semibold">{member.fullName}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{member.username}</div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-muted-foreground">{tSettings("role", locale)}</dt><dd>{localizeRoleTemplate(member.roleName, locale)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tSettings("branch", locale)}</dt><dd>{branchLabel(member)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tSettings("access", locale)}</dt><dd><AccessMarks locale={locale} member={member} /></dd></div>
                    <div><dt className="text-xs text-muted-foreground">{tSettings("status", locale)}</dt><dd><StatusBadge locale={locale} member={member} /></dd></div>
                  </dl>
                  <div className="mt-3"><StaffActions locale={locale} member={member} onDeactivate={disableStaff} onEdit={openEditStaff} onReactivate={setConfirmReactivateId} /></div>
                </article>
              ))}
            </div>
          </section>
          ) : null}

          {section === "roles" ? (
            <RolePermissionsPanel actorIsOwner={actorIsOwner} locale={locale} snapshot={initialSnapshot} onNotify={onNotify} />
          ) : null}

          {section === "approval-rules" ? (
          <section className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="font-semibold">{tSettings("pendingApprovalCenter", locale)}</h3>
            {pendingApprovals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tSettings("noPendingApprovals", locale)}</p>
            ) : (
              <div className="mt-4 max-w-full overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">{tSettings("module", locale)}</th>
                      <th className="px-3 py-3">{tSettings("activityAction", locale)}</th>
                      <th className="px-3 py-3">{tSettings("requestedBy", locale)}</th>
                      <th className="px-3 py-3">{tSettings("approvalReason", locale)}</th>
                      <th className="px-3 py-3">{tSettings("actions", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map((row) => (
                      <tr className="border-b border-border last:border-b-0" key={row.id}>
                        <td className="px-3 py-3">{localizePermissionModule(row.module, locale)}</td>
                        <td className="px-3 py-3">{row.action ?? "-"}</td>
                        <td className="px-3 py-3">{row.requestBy}</td>
                        <td className="px-3 py-3">{row.reason ?? "-"}</td>
                        <td className="px-3 py-3">
                          <button className="mr-2 h-8 rounded-md bg-success px-3 text-xs font-semibold text-white" disabled={isPending} type="button" onClick={() => decideApproval(row.id, "approved")}>{tSettings("approve", locale)}</button>
                          <button className="h-8 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger" disabled={isPending} type="button" onClick={() => decideApproval(row.id, "rejected")}>{tSettings("reject", locale)}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          ) : null}
        </div>
      </div>

      {section === "staff" && staffModalOpen ? (
        <SettingsLargeDrawer
          closeLabel={tSettings("closeModal", locale)}
          title={editingStaffId ? tSettings("editStaff", locale) : tSettings("addStaff", locale)}
          onClose={() => setStaffModalOpen(false)}
          footer={(
            <>
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setStaffModalOpen(false)}>{tSettings("cancel", locale)}</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={isPending} type="button" onClick={saveStaff}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {editingStaffId ? tSettings("saveStaff", locale) : tSettings("addStaff", locale)}
              </button>
            </>
          )}
        >
          <div className="grid gap-6">
            {staffFormError ? <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-foreground" role="alert">{staffFormError}</p> : null}
            {!editingStaffId ? (
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold">{tSettings("staffPreset", locale)}</legend>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label={tSettings("staffPreset", locale)}>
                  {([
                    ["cashier", "cashierDefault"],
                    ["manager", "managerDefault"],
                    ["last-used", "lastUsedPreset"],
                    ["custom", "customPreset"],
                  ] as const).map(([value, labelKey], index) => {
                    const selected = staffPreset === value;
                    return (
                      <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-foreground"}`} key={value}>
                        <input
                          ref={index === 0 ? presetRadioRef : undefined}
                          checked={selected}
                          className="size-4 accent-primary"
                          name="staff-preset"
                          type="radio"
                          value={value}
                          onChange={() => choosePreset(value)}
                        />
                        <span>{tSettings(labelKey, locale)}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{staffPreset === "last-used" ? `${tSettings("lastUsedPreset", locale)} · ${tSettings("scopeThisDevice", locale)}` : `${tSettings("staffPreset", locale)} · ${tSettings("scopeCompany", locale)}`}</p>
                <p className="text-xs text-muted-foreground">{tSettings("individualOverridesLater", locale)}</p>
              </fieldset>
            ) : null}
            <FormSection title={tSettings("basicInformation", locale)}>
              <Field label={tSettings("fullName", locale)}>
                <input ref={nameInputRef} autoComplete="name" className="field-input" required value={staffDraft.fullName} onChange={(event) => setStaffDraft((current) => ({ ...current, fullName: event.target.value }))} />
              </Field>
              <Field label={tSettings("username", locale)}>
                <input autoComplete="username" className="field-input" required value={staffDraft.username} onChange={(event) => setStaffDraft((current) => ({ ...current, username: event.target.value }))} />
              </Field>
            </FormSection>
            <FormSection title={tSettings("roleAndBranch", locale)}>
              <Field label={tSettings("role", locale)}>
                <select aria-label={tSettings("role", locale)} className="field-input" disabled={editingSelf} value={staffDraft.roleId} onChange={(event) => markCustom({ roleId: event.target.value })}>
                  {assignableRoles.map((entry) => <option key={entry.id} value={entry.id}>{`${localizeRoleTemplate(entry.name, locale)} — ${roleOptionSummary(entry.templateKey, locale)}`}</option>)}
                </select>
              </Field>
              <Field label={tSettings("branch", locale)}>
                <select aria-label={tSettings("branch", locale)} className="field-input" value={staffDraft.branchId} onChange={(event) => markCustom({ branchId: event.target.value })}>
                  {initialSnapshot.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </Field>
              {!editingStaffId && ["Staff/Cashier", "Manager"].includes(assignableRoles.find((entry) => entry.id === staffDraft.roleId)?.templateKey ?? "") ? (
                <div className="md:col-span-2">
                  <button className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold" type="button" onClick={applySelectedRoleDefault}>{tSettings("applyRoleDefault", locale)}</button>
                </div>
              ) : null}
            </FormSection>
            <FormSection title={tSettings("access", locale)}>
              <AccessSwitch
                checked={staffDraft.allowPosAccess}
                description={tSettings("posAccessHelp", locale)}
                disabled={editingSelf}
                label={tSettings("posAccess", locale)}
                onChange={(allowPosAccess) => markCustom({ allowPosAccess })}
              />
              <AccessSwitch
                checked={staffDraft.allowBackOfficeAccess}
                description={tSettings("backOfficeAccessHelp", locale)}
                disabled={editingSelf}
                label={tSettings("backOfficeAccess", locale)}
                onChange={(allowBackOfficeAccess) => markCustom({ allowBackOfficeAccess })}
              />
              {!staffDraft.allowPosAccess && !staffDraft.allowBackOfficeAccess ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground md:col-span-2" role="alert">{tSettings("bothAccessOffWarning", locale)}</p>
              ) : null}
              {!editingStaffId && actorIsOwner ? (
                <div className="grid gap-2 md:col-span-2">
                  <p className="text-xs text-muted-foreground">{tSettings("scopeCompany", locale)} · {tSettings("staffDefaultCompanyHelp", locale)}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-semibold" disabled={isPending} type="button" onClick={() => saveCreateDefault("cashier")}>{tSettings("saveAsCashierDefault", locale)}</button>
                    <button className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-semibold" disabled={isPending} type="button" onClick={() => saveCreateDefault("manager")}>{tSettings("saveAsManagerDefault", locale)}</button>
                    <button className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-semibold" disabled={isPending} type="button" onClick={() => setResetKind("cashier")}>{tSettings("resetCashierDefault", locale)}</button>
                    <button className="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-semibold" disabled={isPending} type="button" onClick={() => setResetKind("manager")}>{tSettings("resetManagerDefault", locale)}</button>
                  </div>
                </div>
              ) : null}
            </FormSection>
            <FormSection title={tSettings("accountStatus", locale)}>
              <Field label={tSettings("accountStatus", locale)}>
                <select aria-label={tSettings("accountStatus", locale)} className="field-input" value={staffDraft.status} onChange={(event) => setStaffDraft((current) => ({ ...current, status: event.target.value as StaffDraft["status"] }))}>
                  <option value="active">{tSettings("active", locale)}</option>
                  <option value="disabled">{tSettings("disabled", locale)}</option>
                </select>
              </Field>
            </FormSection>
            <FormSection title={tSettings("securitySection", locale)}>
              <p className="text-xs leading-5 text-muted-foreground md:col-span-2">{editingStaffId ? tSettings("passwordResetHelp", locale) : tSettings("passwordRequired", locale)}</p>
              <Field label={editingStaffId ? tSettings("newPassword", locale) : tSettings("password", locale)}>
                <input autoComplete="new-password" className="field-input" type="password" value={staffDraft.password} onChange={(event) => setStaffDraft((current) => ({ ...current, password: event.target.value }))} />
              </Field>
              <Field label={tSettings("confirmNewPassword", locale)}>
                <input autoComplete="new-password" className="field-input" type="password" value={staffDraft.confirmPassword} onChange={(event) => setStaffDraft((current) => ({ ...current, confirmPassword: event.target.value }))} />
              </Field>
            </FormSection>
            <StaffAccessPreviewPanel
              branchName={initialSnapshot.branches.find((branch) => branch.id === staffDraft.branchId)?.name || tSettings("unknownBranch", locale)}
              locale={locale}
              permissionKeys={initialSnapshot.permissionKeysByRole?.[staffDraft.roleId] ?? []}
              roleName={localizeRoleTemplate(assignableRoles.find((entry) => entry.id === staffDraft.roleId)?.name ?? "", locale)}
              staffDraft={staffDraft}
            />
          </div>
        </SettingsLargeDrawer>
      ) : null}

      {confirmDeactivateId ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setConfirmDeactivateId(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={() => commitDisableStaff(confirmDeactivateId)}>{tSettings("deactivate", locale)}</button>
            </div>
          )}
          onClose={() => setConfirmDeactivateId(null)}
          size="sm"
          title={fillSettingsCopy(tSettings("deactivateStaffNamed", locale), { name: deactivateTarget?.fullName ?? "" })}
        >
          <p className="text-sm text-muted-foreground">{tSettings("deactivateStaffHistory", locale)}</p>
        </AppSmallModal>
      ) : null}

      {confirmReactivateId ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setConfirmReactivateId(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => commitReactivateStaff(confirmReactivateId)}>{tSettings("reactivate", locale)}</button>
            </div>
          )}
          onClose={() => setConfirmReactivateId(null)}
          size="sm"
          title={fillSettingsCopy(tSettings("reactivateStaffNamed", locale), { name: reactivateTarget?.fullName ?? "" })}
        >
          <p className="text-sm text-muted-foreground">{tSettings("reactivateStaffConfirm", locale)}</p>
        </AppSmallModal>
      ) : null}

      {resetKind ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setResetKind(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={commitResetDefault}>{tSettings("resetToDefault", locale)}</button>
            </div>
          )}
          onClose={() => setResetKind(null)}
          size="sm"
          title={tSettings("resetStaffDefaultTitle", locale)}
        >
          <p className="text-sm text-muted-foreground">{fillSettingsCopy(tSettings("resetStaffDefaultBody", locale), { role: tSettings(resetKind === "cashier" ? "cashierDefault" : "managerDefault", locale) })}</p>
        </AppSmallModal>
      ) : null}

      {confirmApprovalRule ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setConfirmApprovalRule(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => commitSaveRule(confirmApprovalRule)}>{tSettings("applyChanges", locale)}</button>
            </div>
          )}
          onClose={() => setConfirmApprovalRule(null)}
          size="sm"
          title={tSettings("saveApprovalConfirmTitle", locale)}
        >
          <p className="text-sm text-muted-foreground">{fillSettingsCopy(tSettings("saveApprovalConfirmBody", locale), { rule: localizeApprovalRule(confirmApprovalRule, locale) })}</p>
        </AppSmallModal>
      ) : null}
    </section>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return <div className="flex items-center gap-2"><Icon className="size-5 text-primary" aria-hidden="true" /><h2 className="text-xl font-semibold">{title}</h2></div>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function StaffAccessPreviewPanel({
  branchName,
  locale,
  permissionKeys,
  roleName,
  staffDraft,
}: {
  branchName: string;
  locale: SupportedLocale;
  permissionKeys: readonly string[];
  roleName: string;
  staffDraft: Pick<StaffDraft, "allowBackOfficeAccess" | "allowPosAccess">;
}) {
  const preview = previewStaffAccess({
    allowBackOfficeAccess: staffDraft.allowBackOfficeAccess,
    allowPosAccess: staffDraft.allowPosAccess,
    permissionKeys,
  });
  const reportsLabel = preview.reports === "today"
    ? tSettings("reportsTodayOnly", locale)
    : preview.reports === "historical"
      ? tSettings("reportsHistorical", locale)
      : tSettings("reportsHidden", locale);
  return (
    <section aria-labelledby="effective-access-preview-title" className="rounded-lg border border-border bg-background p-4">
      <h3 className="text-sm font-semibold" id="effective-access-preview-title">{tSettings("effectiveAccessPreview", locale)}</h3>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">{tSettings("role", locale)}</dt><dd>{roleName || tSettings("staffRoleRequired", locale)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("branch", locale)}</dt><dd>{branchName}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("pos", locale)}</dt><dd>{preview.pos === "allowed" ? tSettings("allowed", locale) : tSettings("blocked", locale)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("backOffice", locale)}</dt><dd>{preview.backOffice === "allowed" ? tSettings("allowed", locale) : tSettings("blocked", locale)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("previewReports", locale)}</dt><dd>{reportsLabel}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("reportsProfit", locale)}</dt><dd>{preview.profit === "visible" ? tSettings("previewVisible", locale) : tSettings("reportsHidden", locale)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("reportsCost", locale)}</dt><dd>{preview.cost === "visible" ? tSettings("previewVisible", locale) : tSettings("reportsHidden", locale)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{tSettings("permRefund", locale)}</dt><dd>{preview.refund === "allowed" ? tSettings("allowed", locale) : tSettings("previewDenied", locale)}</dd></div>
      </dl>
      {!staffDraft.allowBackOfficeAccess ? <p className="mt-3 text-xs text-muted-foreground">{tSettings("backOfficeBlocksReports", locale)}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">{tSettings("staffPresetRoleNote", locale)}</p>
    </section>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function AccessSwitch({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-4 md:col-span-2">
      <div>
        <div className="text-sm font-semibold" id={labelId}>{label}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground" id={descriptionId}>{description}</p>
      </div>
      <button
        aria-checked={checked}
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        className={checked ? "relative h-7 w-12 shrink-0 rounded-full bg-primary disabled:opacity-50" : "relative h-7 w-12 shrink-0 rounded-full bg-muted disabled:opacity-50"}
        disabled={disabled}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span className={checked ? "absolute top-0.5 left-5 size-6 rounded-full bg-primary-foreground" : "absolute top-0.5 left-0.5 size-6 rounded-full bg-foreground"} />
      </button>
    </div>
  );
}

function AccessMarks({ locale, member }: { locale: SupportedLocale; member: StaffMemberRecord }) {
  return (
    <div className="grid gap-1 text-xs">
      <span>{tSettings("pos", locale)} {member.allowPosAccess ? "✓" : "—"} <span className="sr-only">{member.allowPosAccess ? tSettings("allowed", locale) : tSettings("blocked", locale)}</span></span>
      <span>{tSettings("backOffice", locale)} {member.allowBackOfficeAccess ? "✓" : "—"} <span className="sr-only">{member.allowBackOfficeAccess ? tSettings("allowed", locale) : tSettings("blocked", locale)}</span></span>
    </div>
  );
}

function StatusBadge({ locale, member }: { locale: SupportedLocale; member: StaffMemberRecord }) {
  if (member.isOwner) {
    return <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold">{tSettings("protected", locale)}</span>;
  }
  return <span className={member.status === "active" ? "rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success" : "rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger"}>{localizeStaffStatus(member.status, locale)}</span>;
}

function StaffActions({
  locale,
  member,
  onDeactivate,
  onEdit,
  onReactivate,
}: {
  locale: SupportedLocale;
  member: StaffMemberRecord;
  onDeactivate: (id: string) => void;
  onEdit: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  if (member.isOwner) {
    return (
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-border px-2 py-1">{tSettings("owner", locale)}</span>
        <span className="rounded-full border border-border px-2 py-1">{tSettings("protected", locale)}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button aria-label={`${tSettings("edit", locale)} ${member.fullName}`} className="h-8 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => onEdit(member.id)}>{tSettings("edit", locale)}</button>
      {member.status === "active" ? (
        <button aria-label={`${tSettings("deactivate", locale)} ${member.fullName}`} className="h-8 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger" type="button" onClick={() => onDeactivate(member.id)}>{tSettings("deactivate", locale)}</button>
      ) : (
        <button aria-label={`${tSettings("reactivate", locale)} ${member.fullName}`} className="h-8 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => onReactivate(member.id)}>{tSettings("reactivate", locale)}</button>
      )}
    </div>
  );
}
