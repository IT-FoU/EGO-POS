"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import {
  archiveLoyaltyEarningRuleAction,
  saveLoyaltyEarningRuleAction,
  setLoyaltyEarningRuleEnabledAction,
} from "@/features/loyalty/actions";
import {
  LOYALTY_RULE_TYPES,
  type LoyaltyEarningRuleRecord,
  type LoyaltyRuleConfig,
  type LoyaltyRuleType,
} from "@/features/loyalty/earning-rules";
import { fillSettingsCopy, localizeSettingsError, tSettings } from "@/lib/i18n/settings-copy";
import type { SupportedLocale } from "@/lib/constants";

export type LoyaltyCatalogItem = { id: string; name: string };

const TYPE_LABEL: Record<LoyaltyRuleType, string> = {
  CATEGORY_BONUS: "categoryBonusRule",
  ITEM_QUANTITY: "itemQuantityRule",
  MINIMUM_BASKET: "minimumBasketRule",
  PRODUCT_BONUS: "productBonusRule",
  SPEND_AMOUNT: "spendAmountRule",
};

function summary(rule: LoyaltyEarningRuleRecord, locale: SupportedLocale) {
  const points = String(rule.config.points ?? 0);
  if (rule.ruleType === "SPEND_AMOUNT") {
    return fillSettingsCopy(tSettings("ruleSummarySpend", locale), { points, spend: String(rule.config.spendLak ?? 0) });
  }
  if (rule.ruleType === "ITEM_QUANTITY") {
    return fillSettingsCopy(tSettings("ruleSummaryItems", locale), { points, quantity: String(rule.config.quantity ?? 0) });
  }
  if (rule.ruleType === "MINIMUM_BASKET") {
    return fillSettingsCopy(tSettings("ruleSummaryBasket", locale), { points, threshold: String(rule.config.thresholdLak ?? 0) });
  }
  if (rule.ruleType === "PRODUCT_BONUS") return fillSettingsCopy(tSettings("ruleSummaryProduct", locale), { points });
  return fillSettingsCopy(tSettings("ruleSummaryCategory", locale), { points });
}

function emptyConfig(ruleType: LoyaltyRuleType): LoyaltyRuleConfig {
  if (ruleType === "SPEND_AMOUNT") return { points: 1, spendLak: 10000 };
  if (ruleType === "ITEM_QUANTITY") return { points: 1, quantity: 5 };
  if (ruleType === "MINIMUM_BASKET") return { points: 1, thresholdLak: 50000 };
  if (ruleType === "PRODUCT_BONUS") return { points: 1, productIds: [] };
  return { categoryIds: [], points: 1 };
}

export function LoyaltyRulesPanel({
  categories,
  initialRules,
  locale,
  products,
}: {
  categories: LoyaltyCatalogItem[];
  initialRules: LoyaltyEarningRuleRecord[];
  locale: SupportedLocale;
  products: LoyaltyCatalogItem[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [editor, setEditor] = useState<LoyaltyEarningRuleRecord | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const catalog = editor?.ruleType === "CATEGORY_BONUS" ? categories : products;
  const visibleCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((item) => !needle || item.name.toLowerCase().includes(needle)).slice(0, 80);
  }, [catalog, query]);

  function openCreate() {
    setQuery("");
    setEditor({
      config: emptyConfig("SPEND_AMOUNT"),
      enabled: true,
      id: "",
      name: "",
      ruleType: "SPEND_AMOUNT",
      sortOrder: rules.length,
      status: "active",
    });
  }

  function saveEditor() {
    if (!editor) return;
    startTransition(async () => {
      const result = await saveLoyaltyEarningRuleAction({
        config: editor.config,
        enabled: editor.enabled,
        id: editor.id || undefined,
        name: editor.name,
        ruleType: editor.ruleType,
      });
      if (!result.ok || !result.data) {
        setMessage(localizeSettingsError(result.error, locale));
        return;
      }
      setRules(result.data as LoyaltyEarningRuleRecord[]);
      setEditor(null);
      setMessage(tSettings("ruleSaved", locale));
    });
  }

  function toggle(rule: LoyaltyEarningRuleRecord) {
    startTransition(async () => {
      const result = await setLoyaltyEarningRuleEnabledAction(rule.id, !rule.enabled);
      if (!result.ok || !result.data) {
        setMessage(localizeSettingsError(result.error, locale));
        return;
      }
      setRules(result.data as LoyaltyEarningRuleRecord[]);
    });
  }

  function archive() {
    if (!archiveId) return;
    startTransition(async () => {
      const result = await archiveLoyaltyEarningRuleAction(archiveId);
      if (!result.ok || !result.data) {
        setMessage(localizeSettingsError(result.error, locale));
        setArchiveId(null);
        return;
      }
      setRules(result.data as LoyaltyEarningRuleRecord[]);
      setArchiveId(null);
      setMessage(tSettings("ruleArchived", locale));
    });
  }

  function selectedIds() {
    if (!editor) return [];
    return editor.ruleType === "CATEGORY_BONUS" ? editor.config.categoryIds ?? [] : editor.config.productIds ?? [];
  }

  function toggleCatalog(id: string) {
    if (!editor) return;
    const current = new Set(selectedIds());
    if (current.has(id)) current.delete(id);
    else current.add(id);
    const ids = [...current];
    setEditor({
      ...editor,
      config: editor.ruleType === "CATEGORY_BONUS" ? { ...editor.config, categoryIds: ids } : { ...editor.config, productIds: ids },
    });
  }

  return (
    <div className="mt-6 grid gap-3" data-loyalty-rules>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{tSettings("earningRules", locale)}</h2>
          <p className="text-sm text-muted-foreground">{tSettings("loyaltyStackHelp", locale)}</p>
        </div>
        <button className="settings-motion-save inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={openCreate}>
          <Plus aria-hidden="true" className="size-4" />
          {tSettings("addEarningRule", locale)}
        </button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {rules.length === 0 ? <p className="text-sm text-muted-foreground">{tSettings("noEarningRules", locale)}</p> : null}
      <div className="grid gap-3">
        {rules.map((rule) => (
          <article className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" data-loyalty-rule={rule.id} key={rule.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{rule.name}</h3>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{tSettings(TYPE_LABEL[rule.ruleType], locale)}</span>
                <span className="text-xs font-semibold">{rule.enabled ? tSettings("ruleEnabled", locale) : tSettings("ruleDisabled", locale)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{summary(rule, locale)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => { setQuery(""); setEditor(rule); }}>
                <Pencil aria-hidden="true" className="mr-1 inline size-3.5" />
                {tSettings("edit", locale)}
              </button>
              <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => toggle(rule)}>
                {rule.enabled ? tSettings("ruleDisabled", locale) : tSettings("ruleEnabled", locale)}
              </button>
              <button className="h-9 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger" type="button" onClick={() => setArchiveId(rule.id)}>
                <Archive aria-hidden="true" className="mr-1 inline size-3.5" />
                {tSettings("archiveRule", locale)}
              </button>
            </div>
          </article>
        ))}
      </div>
      {editor ? (
        <AppSmallModal
          closeAriaLabel={tSettings("cancel", locale)}
          description={editor.ruleType === "ITEM_QUANTITY" ? tSettings("itemQuantityHelp", locale) : editor.ruleType === "PRODUCT_BONUS" ? tSettings("productBonusHelp", locale) : editor.ruleType === "CATEGORY_BONUS" ? tSettings("categoryBonusHelp", locale) : editor.ruleType === "MINIMUM_BASKET" ? tSettings("basketOnceHelp", locale) : undefined}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setEditor(null)}>{tSettings("cancel", locale)}</button>
              <button className="settings-motion-save h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending} type="button" onClick={saveEditor}>{tSettings("saveRule", locale)}</button>
            </div>
          )}
          onClose={() => setEditor(null)}
          size="md"
          title={editor.id ? tSettings("editEarningRule", locale) : tSettings("addEarningRule", locale)}
        >
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              {tSettings("ruleName", locale)}
              <input className="field-input font-normal" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {tSettings("ruleType", locale)}
              <select
                className="field-input font-normal"
                disabled={Boolean(editor.id)}
                value={editor.ruleType}
                onChange={(event) => {
                  const ruleType = event.target.value as LoyaltyRuleType;
                  setEditor({ ...editor, config: emptyConfig(ruleType), ruleType });
                }}
              >
                {LOYALTY_RULE_TYPES.map((ruleType) => (
                  <option key={ruleType} value={ruleType}>{tSettings(TYPE_LABEL[ruleType], locale)}</option>
                ))}
              </select>
            </label>
            {editor.ruleType === "SPEND_AMOUNT" ? (
              <NumberField label={tSettings("spendLakPerPoint", locale)} value={editor.config.spendLak ?? 0} onChange={(spendLak) => setEditor({ ...editor, config: { ...editor.config, spendLak } })} />
            ) : null}
            {editor.ruleType === "ITEM_QUANTITY" ? (
              <NumberField label={tSettings("itemCount", locale)} value={editor.config.quantity ?? 0} onChange={(quantity) => setEditor({ ...editor, config: { ...editor.config, quantity } })} />
            ) : null}
            {editor.ruleType === "MINIMUM_BASKET" ? (
              <NumberField label={tSettings("basketAmount", locale)} value={editor.config.thresholdLak ?? 0} onChange={(thresholdLak) => setEditor({ ...editor, config: { ...editor.config, thresholdLak } })} />
            ) : null}
            <NumberField label={editor.ruleType === "PRODUCT_BONUS" || editor.ruleType === "CATEGORY_BONUS" ? tSettings("pointsPerItem", locale) : tSettings("pointsAwarded", locale)} value={editor.config.points ?? 0} onChange={(points) => setEditor({ ...editor, config: { ...editor.config, points } })} />
            {editor.ruleType === "PRODUCT_BONUS" || editor.ruleType === "CATEGORY_BONUS" ? (
              <div className="grid gap-2">
                <label className="text-sm font-semibold">{editor.ruleType === "PRODUCT_BONUS" ? tSettings("selectProducts", locale) : tSettings("selectCategories", locale)}</label>
                <input className="field-input" placeholder={tSettings("searchCatalog", locale)} value={query} onChange={(event) => setQuery(event.target.value)} />
                <div className="grid max-h-48 gap-1 overflow-auto rounded-md border border-border p-2">
                  {visibleCatalog.map((item) => (
                    <label className="flex items-center gap-2 text-sm" key={item.id}>
                      <input checked={selectedIds().includes(item.id)} type="checkbox" onChange={() => toggleCatalog(item.id)} />
                      <span className="min-w-0 truncate">{item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </AppSmallModal>
      ) : null}
      {archiveId ? (
        <AppSmallModal
          closeAriaLabel={tSettings("cancel", locale)}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setArchiveId(null)}>{tSettings("cancel", locale)}</button>
              <button className="settings-motion-save h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={isPending} type="button" onClick={archive}>{tSettings("archiveRule", locale)}</button>
            </div>
          )}
          onClose={() => setArchiveId(null)}
          size="sm"
          title={tSettings("archiveRule", locale)}
        >
          <p className="text-sm">{tSettings("archiveRuleConfirm", locale)}</p>
        </AppSmallModal>
      ) : null}
    </div>
  );
}

function NumberField({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input className="field-input font-normal" min="1" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
