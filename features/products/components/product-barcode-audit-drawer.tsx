"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auditProductBarcodesAction } from "@/features/products/actions";
import {
  barcodeAuditCsv,
  barcodeAuditFilename,
  type BarcodeAuditIssue,
  type BarcodeAuditIssueType,
  type BarcodeAuditResult,
} from "@/features/products/barcode-audit";
import { WhiteDataTable } from "@/features/products/components/selected-products-list";
import { localizedProductName } from "@/features/pos/product-display-name";
import type { SupportedLocale } from "@/lib/constants";
import { productStatusLabel, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type AuditFilter = "all" | BarcodeAuditIssueType | "invalid";

export function BarcodeAuditDrawer({ onClose }: { onClose: () => void }) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [audit, setAudit] = useState<BarcodeAuditResult | null>(null);
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void auditProductBarcodesAction().then((response) => {
      if (cancelled) return;
      if (!response.ok || !response.data) {
        const error = response.error ?? "";
        setMessage(error.includes("Permission denied") ? tProducts("auditPermissionDenied", locale) : error || tProducts("auditNoIssues", locale));
        setLoading(false);
        return;
      }
      setAudit(response.data as BarcodeAuditResult);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const labels = useMemo(() => ({
    conflict: t("auditConflict"),
    duplicate: t("auditDuplicate"),
    invalid: t("auditInvalid"),
    missing: t("auditMissing"),
    missing_barcode: t("auditMissingDetail"),
    scan_conflict: t("auditScanConflict"),
    shared_barcode: t("auditSharedBarcode"),
  }), [locale]);

  const rows = (audit?.issues ?? []).filter((issue) => {
    if (filter === "invalid") return false;
    if (filter === "duplicate") return issue.issue === "duplicate" || issue.issue === "conflict";
    if (filter !== "all" && issue.issue !== filter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [issue.productName, issue.nameEn, issue.nameLo, issue.sku, issue.barcode, issue.unitName].some((value) => value.toLowerCase().includes(needle));
  });

  function exportAudit() {
    if (!audit) return;
    const csv = barcodeAuditCsv(rows.map((issue) => ({
      ...issue,
      productName: localizedProductName({ nameEn: issue.nameEn, nameLo: issue.nameLo }, locale),
    })), labels);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = barcodeAuditFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return (
    <div className="grid gap-5" data-missing-products={audit?.missingProductIds.length ?? 0} data-testid="products-barcode-audit">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-testid="products-barcode-audit-summary">
        <Summary label={t("auditProductsChecked")} testId="products-barcode-audit-products" value={audit?.productsChecked ?? 0}/>
        <Summary label={t("auditUnitsChecked")} testId="products-barcode-audit-units" value={audit?.unitsChecked ?? 0}/>
        <Summary label={t("auditMissing")} testId="products-barcode-audit-missing" value={audit?.missingCount ?? 0}/>
        <Summary label={t("auditDuplicate")} testId="products-barcode-audit-duplicate" value={audit?.duplicateCount ?? 0}/>
        <Summary label={t("auditInvalid")} testId="products-barcode-audit-invalid" value={0}/>
        <Summary label={t("auditConflict")} testId="products-barcode-audit-conflict" value={audit?.conflictCount ?? 0}/>
      </section>
      <p className="text-sm text-muted-foreground">{t("auditInvalidNote")}</p>
      <div className="flex flex-wrap gap-2" data-testid="products-barcode-audit-filter">
        {([
          ["all", t("auditAllIssues")],
          ["missing", t("auditMissing")],
          ["duplicate", t("auditDuplicate")],
          ["invalid", t("auditInvalid")],
          ["conflict", t("auditConflict")],
        ] as const).map(([value, label]) => (
          <button className={`h-9 rounded-full border px-3 text-xs font-semibold ${filter === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`} key={value} type="button" onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <input className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" data-testid="products-barcode-audit-search" placeholder={t("auditSearch")} value={search} onChange={(event) => setSearch(event.target.value)}/>
      {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
      <WhiteDataTable minWidth="980px" testId="products-barcode-audit-table">
        <thead>
          <tr>
            <th>{t("auditProduct")}</th>
            <th>{t("sku")}</th>
            <th className="mid">{t("auditUnit")}</th>
            <th>{t("auditBarcode")}</th>
            <th>{t("auditIssue")}</th>
            <th>{t("status")}</th>
            <th className="mid">{t("action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((issue, index) => (
            <AuditRow detail={labels[issue.details]} issue={issue} key={`${issue.issue}-${issue.productId}-${issue.unitName}-${issue.barcode}-${index}`} label={labels[issue.issue]} locale={locale} openLabel={t("auditOpenProduct")}/>
          ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td className="mid" colSpan={7} data-testid="products-barcode-audit-empty">{filter === "invalid" ? t("auditInvalidNote") : t("auditNoIssues")}</td>
            </tr>
          ) : null}
          {loading ? <tr><td className="mid" colSpan={7}>{t("auditBusy")}</td></tr> : null}
        </tbody>
      </WhiteDataTable>
      <div className="flex flex-wrap justify-end gap-2">
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("closeDrawer")}</button>
        <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-barcode-audit-export" disabled={!audit} type="button" onClick={exportAudit}>{t("auditExport")}</button>
      </div>
    </div>
  );
}

function AuditRow({ detail, issue, label, locale, openLabel }: {
  detail: string;
  issue: BarcodeAuditIssue;
  label: string;
  locale: SupportedLocale;
  openLabel: string;
}) {
  const name = localizedProductName({ nameEn: issue.nameEn, nameLo: issue.nameLo }, locale);
  return (
    <tr data-testid="products-barcode-audit-row">
      <td className="font-semibold">{name}</td>
      <td className="font-mono text-xs">{issue.sku || "-"}</td>
      <td className="mid">{issue.unitName}</td>
      <td className="font-mono text-xs">{issue.barcode || "-"}</td>
      <td>
        <div className="font-semibold">{label}</div>
        <div className="ego-muted text-xs">{detail}</div>
      </td>
      <td>{productStatusLabel(issue.status, locale)}</td>
      <td className="mid">
        <Link className="ego-row-open" data-testid="products-barcode-audit-open" href={`/products/${issue.productId}/edit`}>{openLabel}</Link>
      </td>
    </tr>
  );
}

function Summary({ label, testId, value }: { label: string; testId: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3" data-testid={testId}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
