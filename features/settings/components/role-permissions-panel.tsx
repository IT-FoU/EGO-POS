"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveRolePermissionsAction } from "@/features/access-control/actions";
import {
  ROLE_PERMISSION_MODULES,
  ROLE_TEMPLATE_ORDER,
  draftFromPermissionKeys,
  enabledModuleCount,
  permissionKeysForDraft,
  previewRoleAccess,
  recommendedRoleDraft,
  roleDraftsEqual,
  setRoleModuleEnabled,
  toggleRoleAdvanced,
  type RolePermissionDraft,
} from "@/features/access-control/role-permission-v2";
import { readRetainedRoleDraft, writeRetainedRoleDraft } from "@/features/access-control/staff-presets";
import type { StaffAccessSnapshot } from "@/features/access-control/types";
import type { RoleTemplateLabel } from "@/features/access-control/permission-catalog";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import type { SupportedLocale } from "@/lib/constants";
import { fillSettingsCopy, localizeRoleTemplate, localizeSettingsError, tSettings } from "@/lib/i18n/settings-copy";

export function RolePermissionsPanel({
  actorIsOwner,
  locale,
  snapshot,
  onNotify,
}: {
  actorIsOwner: boolean;
  locale: SupportedLocale;
  snapshot: StaffAccessSnapshot;
  onNotify: (message: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const roles = useMemo(() => sortRoles(snapshot.roles), [snapshot.roles]);
  const [selectedId, setSelectedId] = useState(roles.find((role) => role.templateKey === "Manager")?.id ?? roles[0]?.id ?? "");
  const [draft, setDraft] = useState<RolePermissionDraft>(() => savedDraft(snapshot, selectedId));
  const [baseline, setBaseline] = useState(draft);
  const [query, setQuery] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0];
  const locked = !selected || selected.templateKey === "Owner" || !actorIsOwner;
  const dirty = !roleDraftsEqual(draft, baseline);

  useEffect(() => {
    const next = draftFromPermissionKeys(snapshot.permissionKeysByRole?.[selectedId] ?? [], selected?.templateKey === "Owner" ? null : readRetainedRoleDraft(selectedId));
    const resolved = selected?.templateKey === "Owner" ? recommendedRoleDraft("Owner") : next;
    setDraft(resolved);
    setBaseline(resolved);
  }, [snapshot, selectedId, selected?.templateKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function chooseRole(roleId: string) {
    if (roleId === selectedId) return;
    if (dirty) {
      setPendingRoleId(roleId);
      return;
    }
    setSelectedId(roleId);
  }

  function save() {
    if (!selected || locked) return;
    setConfirmSave(false);
    const permissions = permissionKeysForDraft(draft, snapshot.permissionKeysByRole?.[selected.id] ?? []);
    startTransition(async () => {
      const result = await saveRolePermissionsAction({ permissions, roleId: selected.id });
      if (!result.ok) {
        onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
        return;
      }
      writeRetainedRoleDraft(selected.id, draft);
      onNotify({ text: fillSettingsCopy(tSettings("permissionsSaved", locale), { role: localizeRoleTemplate(selected.name, locale) }), tone: "success" });
      router.refresh();
    });
  }

  function resetRole() {
    if (!selected || selected.templateKey === "Owner" || !actorIsOwner) return;
    const next = recommendedRoleDraft(selected.templateKey);
    setDraft(next);
    setConfirmReset(false);
    const permissions = permissionKeysForDraft(next, snapshot.permissionKeysByRole?.[selected.id] ?? []);
    startTransition(async () => {
      const result = await saveRolePermissionsAction({ permissions, roleId: selected.id });
      if (!result.ok) {
        onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
        return;
      }
      writeRetainedRoleDraft(selected.id, next);
      onNotify({ text: tSettings("roleResetSaved", locale), tone: "success" });
      router.refresh();
    });
  }

  const needle = query.trim().toLowerCase();
  const preview = previewRoleAccess(selected?.templateKey === "Owner" ? recommendedRoleDraft("Owner") : draft);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const saved = savedDraft(snapshot, role.id);
          const count = enabledModuleCount(role.templateKey === "Owner" ? recommendedRoleDraft("Owner") : saved);
          const summary = templateSummary(role.templateKey, locale);
          return (
            <button
              aria-pressed={role.id === selected?.id}
              className={role.id === selected?.id ? "rounded-lg border border-primary bg-primary/10 p-4 text-left" : "rounded-lg border border-border bg-card p-4 text-left hover:border-primary"}
              key={role.id}
              type="button"
              onClick={() => chooseRole(role.id)}
            >
              <div className="font-semibold text-foreground">{localizeRoleTemplate(role.name, locale)}</div>
              <div className="mt-1 text-sm text-foreground">{summary.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{summary.detail}</div>
              {role.templateKey === "Owner" ? null : <div className="mt-2 text-xs text-muted-foreground">{fillSettingsCopy(tSettings("modulesEnabledCount", locale), { count })}</div>}
            </button>
          );
        })}
      </div>

      {selected ? (
        <section aria-labelledby="role-detail-title" className="rounded-lg border border-border bg-background p-4">
          <h3 className="font-semibold text-foreground" id="role-detail-title">{localizeRoleTemplate(selected.name, locale)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tSettings("templateType", locale)}: {templateSummary(selected.templateKey, locale).title}</p>
          <p className="mt-1 text-sm text-foreground">{templateSummary(selected.templateKey, locale).description}</p>
          <p className="mt-3 text-xs text-muted-foreground">{tSettings("permissionV2Hint", locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tSettings("accountGateNote", locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tSettings("approvalRulesSeparate", locale)}{" "}
            <Link className="underline" href="/settings/approval-rules">{tSettings("approvalRulesTitle", locale)}</Link>
          </p>
          {!actorIsOwner ? <p className="mt-3 rounded-md border border-border bg-card p-3 text-sm text-foreground" role="status">{tSettings("roleAdminOwnerOnly", locale)}</p> : null}

          {selected.templateKey === "Owner" ? (
            <div className="mt-4 rounded-md border border-border bg-card p-4">
              <div className="font-semibold">{tSettings("roleFullAccess", locale)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{tSettings("protected", locale)}</div>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {ROLE_PERMISSION_MODULES.map((entry) => <li key={entry.id}>{tSettings(entry.labelKey, locale)}</li>)}
              </ul>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h4 className="font-semibold">{tSettings("moduleAccess", locale)}</h4>
                <input aria-label={tSettings("searchPermissions", locale)} className="field-input md:w-72" placeholder={tSettings("searchPermissions", locale)} value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              {ROLE_PERMISSION_MODULES.filter((entry) => moduleMatches(entry.id, entry.labelKey, locale, needle, draft)).map((entry) => {
                const enabled = Boolean(draft[entry.id]?.enabled);
                const permissions = entry.permissions.filter((item) => !needle || tSettings(item.labelKey, locale).toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle));
                return (
                  <section className="rounded-md border border-border bg-card p-3" key={entry.id}>
                    <label className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground">{tSettings(entry.labelKey, locale)}</span>
                      <span className="flex items-center gap-2 text-sm">
                        <span>{enabled ? tSettings("allowed", locale) : tSettings("blocked", locale)}</span>
                        <input
                          aria-label={tSettings(entry.labelKey, locale)}
                          checked={enabled}
                          className="size-4 accent-primary"
                          disabled={locked || isPending}
                          role="switch"
                          type="checkbox"
                          onChange={(event) => setDraft((current) => setRoleModuleEnabled(current, entry.id, event.target.checked, selected.templateKey))}
                        />
                      </span>
                    </label>
                    <details className="mt-3" key={`${entry.id}-${enabled}-${needle}`} open={enabled || Boolean(needle)}>
                      <summary className="cursor-pointer text-sm font-semibold text-primary">{tSettings("advancedPermissions", locale)}</summary>
                      <div className={enabled ? "mt-2 grid gap-2" : "mt-2 grid gap-2 opacity-60"} id={`${entry.id}-advanced`}>
                        {!enabled ? <p className="text-xs text-muted-foreground">{tSettings("moduleOffRetained", locale)}</p> : null}
                        {permissions.map((item) => (
                          <label className="flex items-center justify-between gap-3 text-sm" key={item.id}>
                            <span>
                              {tSettings(item.labelKey, locale)}
                              {item.deferred ? <span className="ml-2 text-xs text-muted-foreground">{tSettings("notEnforcedYet", locale)}</span> : null}
                            </span>
                            <input
                              aria-label={tSettings(item.labelKey, locale)}
                              checked={Boolean(draft[entry.id]?.advanced[item.id])}
                              className="size-4 accent-primary"
                              disabled={locked || isPending || !enabled}
                              type="checkbox"
                              onChange={() => setDraft((current) => toggleRoleAdvanced(current, entry.id, item.id))}
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                  </section>
                );
              })}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={locked || isPending || !dirty} type="button" onClick={() => setConfirmSave(true)}>
                  {fillSettingsCopy(tSettings("savePermissions", locale), { role: localizeRoleTemplate(selected.name, locale) })}
                </button>
                <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60" disabled={locked || isPending} type="button" onClick={() => setConfirmReset(true)}>
                  {selected.templateKey === "Custom" ? tSettings("resetCustomPermissions", locale) : tSettings("resetToDefault", locale)}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{tSettings("saveAsDefaultLater", locale)}</p>
            </div>
          )}

          <section aria-labelledby="preview-access-title" className="mt-4 rounded-md border border-border bg-card p-4">
            <h4 className="font-semibold" id="preview-access-title">{tSettings("previewAccess", locale)}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{tSettings("previewNoImpersonation", locale)}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold">{tSettings("configuredAccess", locale)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tSettings("visibleModules", locale)}</div>
                <ul className="mt-1 text-sm">{preview.visible.map((id) => <li key={id}>{moduleLabel(id, locale)}</li>)}</ul>
                <div className="mt-2 text-xs text-muted-foreground">{tSettings("hiddenModules", locale)}</div>
                <ul className="mt-1 text-sm">{preview.hidden.map((id) => <li key={id}>{moduleLabel(id, locale)}</li>)}</ul>
              </div>
              <div>
                <div className="text-sm font-semibold">{tSettings("configuredReports", locale)}</div>
                <ul className="mt-1 text-sm">
                  {preview.reports.map((item) => (
                    <li key={item.id}>
                      {permissionLabel(item.id, locale)}: {item.enabled ? tSettings("allowed", locale) : tSettings("blocked", locale)}
                      {item.deferred ? ` (${tSettings("notEnforcedYet", locale)})` : ""}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 text-sm font-semibold">{tSettings("sensitiveData", locale)}</div>
                <ul className="mt-1 text-sm">
                  {preview.sensitive.map((item) => (
                    <li key={item.id}>{permissionLabel(item.id, locale)}: {item.enabled ? tSettings("allowed", locale) : tSettings("blocked", locale)} ({tSettings("notEnforcedYet", locale)})</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold">{tSettings("currentRuntimeAccess", locale)}</div>
              <p className="mt-1 text-sm text-muted-foreground">{tSettings(runtimeKey(selected.templateKey), locale)}</p>
            </div>
          </section>
        </section>
      ) : null}

      {confirmSave && selected ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={<ModalActions cancelLabel={tSettings("cancel", locale)} confirmLabel={tSettings("applyChanges", locale)} onCancel={() => setConfirmSave(false)} onConfirm={save} />}
          onClose={() => setConfirmSave(false)}
          size="sm"
          title={tSettings("savePermissionsConfirmTitle", locale)}
        >
          <p className="text-sm text-muted-foreground">{fillSettingsCopy(tSettings("savePermissionsConfirmBody", locale), { role: localizeRoleTemplate(selected.name, locale) })}</p>
        </AppSmallModal>
      ) : null}

      {confirmReset && selected ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={<ModalActions cancelLabel={tSettings("cancel", locale)} confirmLabel={tSettings("applyChanges", locale)} onCancel={() => setConfirmReset(false)} onConfirm={resetRole} />}
          onClose={() => setConfirmReset(false)}
          size="sm"
          title={tSettings("resetRoleConfirmTitle", locale)}
        >
          <p className="text-sm text-muted-foreground">{fillSettingsCopy(tSettings("resetRoleConfirmBody", locale), { role: localizeRoleTemplate(selected.name, locale) })}</p>
        </AppSmallModal>
      ) : null}

      {pendingRoleId ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={<ModalActions cancelLabel={tSettings("cancel", locale)} confirmLabel={tSettings("applyChanges", locale)} onCancel={() => setPendingRoleId(null)} onConfirm={() => { setSelectedId(pendingRoleId); setPendingRoleId(null); }} />}
          onClose={() => setPendingRoleId(null)}
          size="sm"
          title={tSettings("unsavedRoleChanges", locale)}
        >
          <p className="text-sm text-muted-foreground">{tSettings("unsavedRoleChangesBody", locale)}</p>
        </AppSmallModal>
      ) : null}
    </div>
  );
}

function ModalActions({ cancelLabel, confirmLabel, onCancel, onConfirm }: { cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onCancel}>{cancelLabel}</button>
      <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  );
}

function savedDraft(snapshot: StaffAccessSnapshot, roleId: string) {
  const role = snapshot.roles.find((entry) => entry.id === roleId);
  if (role?.templateKey === "Owner") return recommendedRoleDraft("Owner");
  return draftFromPermissionKeys(snapshot.permissionKeysByRole?.[roleId] ?? []);
}

function sortRoles(roles: StaffAccessSnapshot["roles"]) {
  return [...roles].sort((left, right) => {
    const leftIndex = ROLE_TEMPLATE_ORDER.indexOf(left.templateKey);
    const rightIndex = ROLE_TEMPLATE_ORDER.indexOf(right.templateKey);
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  });
}

function templateSummary(template: RoleTemplateLabel, locale: SupportedLocale) {
  if (template === "Owner") {
    return { description: tSettings("roleSummaryOwner", locale), detail: tSettings("protected", locale), title: tSettings("roleFullAccess", locale) };
  }
  if (template === "Manager") {
    return { description: tSettings("roleSummaryManager", locale), detail: tSettings("broaderPermissions", locale), title: tSettings("backOfficeAccessSummary", locale) };
  }
  if (template === "Staff/Cashier") {
    return { description: tSettings("roleSummaryCashier", locale), detail: tSettings("limitedBackOffice", locale), title: tSettings("posFocused", locale) };
  }
  return { description: tSettings("roleSummaryCustom", locale), detail: tSettings("customAccess", locale), title: tSettings("customAccess", locale) };
}

function runtimeKey(template: RoleTemplateLabel) {
  if (template === "Owner") return "runtimeOwner";
  if (template === "Manager") return "runtimeManager";
  if (template === "Staff/Cashier") return "runtimeCashier";
  return "runtimeCustom";
}

function moduleLabel(id: string, locale: SupportedLocale) {
  return tSettings(ROLE_PERMISSION_MODULES.find((entry) => entry.id === id)?.labelKey ?? id, locale);
}

function permissionLabel(id: string, locale: SupportedLocale) {
  for (const entry of ROLE_PERMISSION_MODULES) {
    const match = entry.permissions.find((item) => item.id === id);
    if (match) return tSettings(match.labelKey, locale);
  }
  return id;
}

function moduleMatches(id: string, labelKey: string, locale: SupportedLocale, needle: string, draft: RolePermissionDraft) {
  if (!needle) return true;
  const entry = ROLE_PERMISSION_MODULES.find((item) => item.id === id);
  const haystack = [tSettings(labelKey, locale), ...(entry?.permissions.map((item) => tSettings(item.labelKey, locale)) ?? [])].join(" ").toLowerCase();
  return haystack.includes(needle) || Object.keys(draft[id]?.advanced ?? {}).some((key) => key.includes(needle));
}
