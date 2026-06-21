"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Plus, ShieldCheck, X, type LucideIcon } from "lucide-react";
import {
  decideApprovalAction,
  deactivateStaffMemberAction,
  saveApprovalRuleAction,
  saveRolePermissionsAction,
  saveStaffMemberAction,
} from "@/features/access-control/actions";
import {
  APPROVAL_RULE_LABELS,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULE_LABELS,
  ROLE_TEMPLATE_LABELS,
  matrixToPermissionKeys,
  type RoleTemplateLabel,
} from "@/features/access-control/permission-catalog";
import type { StaffAccessSnapshot } from "@/features/access-control/types";

const TERMINAL_OPTIONS = ["POS-01", "POS-02", "POS-03", "Back Office"];

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
  status: "active" | "inactive";
  username: string;
};

function emptyStaffDraft(branches: StaffAccessSnapshot["branches"], roles: StaffAccessSnapshot["roles"]): StaffDraft {
  const cashierRole = roles.find((role) => role.templateKey === "Staff/Cashier") ?? roles[0];
  return {
    allowBackOfficeAccess: false,
    allowPosAccess: true,
    assignedTerminal: "POS-01",
    branchId: branches[0]?.id ?? "",
    confirmPassword: "",
    fullName: "",
    password: "",
    requirePasswordChange: true,
    roleId: cashierRole?.id ?? "",
    status: "active",
    username: "",
  };
}

export function StaffControlSection({
  currencySettings,
  initialSnapshot,
  loyaltyRules,
  onNotify,
}: {
  currencySettings: React.ReactNode;
  initialSnapshot: StaffAccessSnapshot;
  loyaltyRules: React.ReactNode;
  onNotify: (message: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<RoleTemplateLabel>("Manager");
  const [query, setQuery] = useState("");
  const [matrix, setMatrix] = useState(initialSnapshot.matrix);
  const [staff, setStaff] = useState(initialSnapshot.staff);
  const [approvalRules, setApprovalRules] = useState(initialSnapshot.approvalRules);
  const [pendingApprovals, setPendingApprovals] = useState(initialSnapshot.pendingApprovals);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffDraft>(() => emptyStaffDraft(initialSnapshot.branches, initialSnapshot.roles));

  useEffect(() => {
    setMatrix(initialSnapshot.matrix);
    setStaff(initialSnapshot.staff);
    setApprovalRules(initialSnapshot.approvalRules);
    setPendingApprovals(initialSnapshot.pendingApprovals);
  }, [initialSnapshot]);

  const selectedRole = initialSnapshot.roles.find((entry) => entry.templateKey === role);
  const filteredModules = PERMISSION_MODULE_LABELS.filter((module) => module.toLowerCase().includes(query.toLowerCase()));
  const filteredStaff = staff.filter((member) =>
    [member.fullName, member.username, member.roleName, member.branchName, member.assignedTerminal]
      .join(" ")
      .toLowerCase()
      .includes(staffQuery.toLowerCase()),
  );

  function runMutation(action: () => Promise<{ error?: string; ok: boolean }>, successMessage: string) {
    onNotify(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onNotify({ text: result.error ?? "Save failed.", tone: "error" });
        return;
      }
      onNotify({ text: successMessage, tone: "success" });
      router.refresh();
    });
  }

  function togglePermission(module: (typeof PERMISSION_MODULE_LABELS)[number], actionLabel: (typeof PERMISSION_ACTION_LABELS)[number]) {
    if (role === "Owner") {
      onNotify({ text: t("ui.owner.has.full.access.and.cannot.be.restrict"), tone: "error" });
      return;
    }
    setMatrix((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [module]: {
          ...current[role][module],
          [actionLabel]: !current[role][module][actionLabel],
        },
      },
    }));
  }

  function saveMatrix() {
    if (!selectedRole || role === "Owner") {
      return;
    }
    runMutation(
      () =>
        saveRolePermissionsAction({
          permissions: matrixToPermissionKeys(matrix, role),
          roleId: selectedRole.id,
        }),
      `${role} permissions saved.`,
    );
  }

  function saveRule(ruleKey: keyof typeof APPROVAL_RULE_LABELS) {
    const existing = approvalRules.find((rule) => rule.ruleKey === ruleKey);
    if (!existing) return;
    runMutation(
      () =>
        saveApprovalRuleAction({
          approverRole: existing.approverRole,
          isEnabled: existing.isEnabled,
          ruleKey,
          thresholdLak: existing.thresholdLak,
          thresholdPercent: existing.thresholdPercent,
        }),
      `${APPROVAL_RULE_LABELS[ruleKey]} rule saved.`,
    );
  }

  function openAddStaff() {
    setEditingStaffId(null);
    setStaffDraft(emptyStaffDraft(initialSnapshot.branches, initialSnapshot.roles));
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

  function saveStaff() {
    if (!staffDraft.fullName.trim() || !staffDraft.username.trim() || !staffDraft.branchId || !staffDraft.roleId) {
      onNotify({ text: "Required field missing", tone: "error" });
      return;
    }
    if (!editingStaffId && !staffDraft.password.trim()) {
      onNotify({ text: "Password is required for new staff.", tone: "error" });
      return;
    }
    if (staffDraft.password && staffDraft.password !== staffDraft.confirmPassword) {
      onNotify({ text: "Passwords do not match", tone: "error" });
      return;
    }
    runMutation(
      () =>
        saveStaffMemberAction({
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
        }),
      editingStaffId ? "Staff updated." : "Staff created.",
    );
    setStaffModalOpen(false);
  }

  function disableStaff(memberId: string) {
    runMutation(() => deactivateStaffMemberAction(memberId), "Staff deactivated.");
  }

  function decideApproval(approvalId: string, status: "approved" | "rejected") {
    runMutation(() => decideApprovalAction({ approvalId, status }), `Approval ${status}.`);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={ShieldCheck} title={t("ui.staff.control.permissions")} />
      <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-background p-4">
          <h3 className="font-semibold">Role Templates</h3>
          <div className="mt-4 grid gap-2">
            {ROLE_TEMPLATE_LABELS.map((template) => (
              <button
                className={role === template ? "rounded-md border border-primary bg-primary/10 p-3 text-left text-sm font-semibold" : "rounded-md border border-border bg-card p-3 text-left text-sm font-semibold hover:border-primary"}
                key={template}
                type="button"
                onClick={() => setRole(template)}
              >
                {template}
              </button>
            ))}
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending || role === "Owner"} type="button" onClick={saveMatrix}>
            Save {role} permissions
          </button>
          <div className="mt-4 grid gap-3">
            {(Object.keys(APPROVAL_RULE_LABELS) as Array<keyof typeof APPROVAL_RULE_LABELS>).map((ruleKey) => {
              const rule = approvalRules.find((entry) => entry.ruleKey === ruleKey);
              return (
                <div className="rounded-md border border-border bg-card p-3" key={ruleKey}>
                  <div className="text-xs font-semibold">{APPROVAL_RULE_LABELS[ruleKey]}</div>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input checked={rule?.isEnabled ?? true} className="size-4 accent-primary" type="checkbox" onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, isEnabled: event.target.checked } : entry))} />
                    Enabled
                  </label>
                  <select className="field-input mt-2 h-9 text-xs" value={rule?.approverRole ?? "owner"} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, approverRole: event.target.value } : entry))}>
                    <option value="manager">Manager approval</option>
                    <option value="owner">Owner approval</option>
                  </select>
                  {ruleKey === "discount" ? (
                    <input className="field-input mt-2 h-9 text-xs" min="0" type="number" value={rule?.thresholdPercent ?? 10} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, thresholdPercent: Number(event.target.value) } : entry))} />
                  ) : null}
                  {ruleKey === "refund" || ruleKey === "purchasing" ? (
                    <input className="field-input mt-2 h-9 text-xs" min="0" type="number" value={rule?.thresholdLak ?? 100000} onChange={(event) => setApprovalRules((current) => current.map((entry) => entry.ruleKey === ruleKey ? { ...entry, thresholdLak: Number(event.target.value) } : entry))} />
                  ) : null}
                  <button className="mt-2 h-8 w-full rounded-md border border-border text-xs font-semibold" disabled={isPending} type="button" onClick={() => saveRule(ruleKey)}>
                    Save rule
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0">
          <section className="mb-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{t("ui.staff.access.login.management")}</h3>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="field-input h-10 sm:w-64" placeholder={t("ui.search.staff")} value={staffQuery} onChange={(event) => setStaffQuery(event.target.value)} />
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={openAddStaff}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add Staff
                </button>
              </div>
            </div>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Staff</th>
                    <th className="px-3 py-3">Username</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Branch</th>
                    <th className="px-3 py-3">Terminal</th>
                    <th className="px-3 py-3">Access</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr className="border-b border-border last:border-b-0" key={member.id}>
                      <td className="px-3 py-3 font-semibold">{member.fullName}</td>
                      <td className="px-3 py-3 font-mono text-xs">{member.username}</td>
                      <td className="px-3 py-3">{member.roleName}</td>
                      <td className="px-3 py-3">{member.branchName}</td>
                      <td className="px-3 py-3">{member.assignedTerminal}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className={member.allowPosAccess ? "mr-1 rounded-full bg-success/10 px-2 py-1 text-success" : "mr-1 rounded-full bg-muted px-2 py-1 text-muted-foreground"}>POS</span>
                        <span className={member.allowBackOfficeAccess ? "rounded-full bg-primary/10 px-2 py-1 text-primary" : "rounded-full bg-muted px-2 py-1 text-muted-foreground"}>Back Office</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={member.status === "active" ? "rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success" : "rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger"}>{member.status}</span>
                      </td>
                      <td className="px-3 py-3">
                        {!member.isOwner ? (
                          <div className="flex flex-wrap gap-2">
                            <button className="h-8 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => openEditStaff(member.id)}>Edit</button>
                            <button className="h-8 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger" type="button" onClick={() => disableStaff(member.id)}>Deactivate</button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-semibold">Permission Matrix</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("ui.every.permission.change.must.be.written.to.a")}</p>
              </div>
              <input className="field-input md:w-72" placeholder={t("ui.search.staff.permission.setting")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Module</th>
                    {PERMISSION_ACTION_LABELS.map((action) => <th className="px-3 py-3 text-center" key={action}>{action}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((module) => (
                    <tr className="border-b border-border last:border-b-0" key={module}>
                      <td className="px-3 py-3 font-semibold">{module}</td>
                      {PERMISSION_ACTION_LABELS.map((action) => (
                        <td className="px-3 py-3 text-center" key={action}>
                          <input checked={matrix[role][module][action]} className="size-4 accent-primary disabled:opacity-50" disabled={role === "Owner" || isPending} type="checkbox" onChange={() => togglePermission(module, action)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4">{loyaltyRules}</div>
          <div className="mt-4">{currencySettings}</div>

          <section className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="font-semibold">Pending Approval Center</h3>
            {pendingApprovals.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No pending approvals.</p>
            ) : (
              <div className="mt-4 max-w-full overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Module</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-3 py-3">By</th>
                      <th className="px-3 py-3">Reason</th>
                      <th className="px-3 py-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map((row) => (
                      <tr className="border-b border-border last:border-b-0" key={row.id}>
                        <td className="px-3 py-3">{row.module}</td>
                        <td className="px-3 py-3">{row.action ?? "-"}</td>
                        <td className="px-3 py-3">{row.requestBy}</td>
                        <td className="px-3 py-3">{row.reason ?? "-"}</td>
                        <td className="px-3 py-3">
                          <button className="mr-2 h-8 rounded-md bg-success px-3 text-xs font-semibold text-white" disabled={isPending} type="button" onClick={() => decideApproval(row.id, "approved")}>Approve</button>
                          <button className="h-8 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger" disabled={isPending} type="button" onClick={() => decideApproval(row.id, "rejected")}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {staffModalOpen ? (
        <SettingsDialog title={editingStaffId ? "Edit Staff" : "Add Staff"} onClose={() => setStaffModalOpen(false)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Full name"><input className="field-input" value={staffDraft.fullName} onChange={(event) => setStaffDraft((current) => ({ ...current, fullName: event.target.value }))} /></Field>
            <Field label="Username"><input className="field-input" value={staffDraft.username} onChange={(event) => setStaffDraft((current) => ({ ...current, username: event.target.value }))} /></Field>
            <Field label="Role">
              <select className="field-input" value={staffDraft.roleId} onChange={(event) => setStaffDraft((current) => ({ ...current, roleId: event.target.value }))}>
                {initialSnapshot.roles.filter((entry) => entry.templateKey !== "Owner").map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select className="field-input" value={staffDraft.branchId} onChange={(event) => setStaffDraft((current) => ({ ...current, branchId: event.target.value }))}>
                {initialSnapshot.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </Field>
            <Field label="Terminal">
              <select className="field-input" value={staffDraft.assignedTerminal} onChange={(event) => setStaffDraft((current) => ({ ...current, assignedTerminal: event.target.value }))}>
                {TERMINAL_OPTIONS.map((terminal) => <option key={terminal} value={terminal}>{terminal}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="field-input" value={staffDraft.status} onChange={(event) => setStaffDraft((current) => ({ ...current, status: event.target.value as StaffDraft["status"] }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2"><input checked={staffDraft.allowPosAccess} className="size-4 accent-primary" type="checkbox" onChange={(event) => setStaffDraft((current) => ({ ...current, allowPosAccess: event.target.checked }))} />Allow POS access</label>
            <label className="flex items-center gap-2 text-sm md:col-span-2"><input checked={staffDraft.allowBackOfficeAccess} className="size-4 accent-primary" type="checkbox" onChange={(event) => setStaffDraft((current) => ({ ...current, allowBackOfficeAccess: event.target.checked }))} />Allow back office access</label>
            <Field label={editingStaffId ? "New password (optional)" : "Password"}><input className="field-input" type="password" value={staffDraft.password} onChange={(event) => setStaffDraft((current) => ({ ...current, password: event.target.value }))} /></Field>
            <Field label="Confirm password"><input className="field-input" type="password" value={staffDraft.confirmPassword} onChange={(event) => setStaffDraft((current) => ({ ...current, confirmPassword: event.target.value }))} /></Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setStaffModalOpen(false)}>Cancel</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={isPending} type="button" onClick={saveStaff}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {editingStaffId ? "Save Staff" : "Add Staff"}
            </button>
          </div>
        </SettingsDialog>
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

function SettingsDialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground" type="button" onClick={onClose} aria-label="Close modal"><X className="size-4" aria-hidden="true" /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
