"use client";

import { useEffect, useMemo, useState } from "react";

import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import { formatLak } from "@/features/pos/format";
import {
  exchangeSaleRequest,
  lookupExchangeProducts,
  lookupReturnableSales,
  returnSaleRequest,
  voidSaleRequest,
  type PostSaleManagerApprovalPayload,
} from "@/features/pos/post-sale-client";
import type { ReturnItemCondition, ReturnReceiptSnapshot, ReturnableSaleItem, ReturnableSaleSnapshot } from "@/features/pos/return-types";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillPosCopy, tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

export type ReturnExchangeTab = "return" | "exchange" | "void";

type ReturnExchangeVoidModalProps = {
  initialSaleId?: string;
  initialTab?: ReturnExchangeTab;
  onClose: () => void;
  onCompleted: (message: string) => void;
};

const CONDITIONS: ReturnItemCondition[] = ["sellable", "damaged", "expired", "opened_used"];

const METHODS = [
  { key: "ui.cash", value: "cash" },
  { key: "ui.bank.transfer", value: "transfer" },
  { key: "ui.qr.payment", value: "qr" },
  { key: "ui.card", value: "visa" },
] as const;

function conditionLabel(value: ReturnItemCondition) {
  if (value === "sellable") return tPos("ui.sellable");
  if (value === "damaged") return tPos("ui.damaged");
  if (value === "expired") return tPos("ui.expired");
  return tPos("ui.opened.used");
}

type DraftLine = {
  condition: ReturnItemCondition;
  quantity: number;
  reason: string;
  selected: boolean;
};

type ReplacementDraft = {
  id: string;
  nameEn: string;
  quantity: number;
  sellingPriceLak: number;
  unitId?: string;
};

function emptyDraft(item: ReturnableSaleItem): DraftLine {
  return {
    condition: "sellable",
    quantity: item.remainingQuantity,
    reason: "",
    selected: false,
  };
}

export function ReturnExchangeVoidModal({ initialSaleId, initialTab = "return", onClose, onCompleted }: ReturnExchangeVoidModalProps) {
  const [tab, setTab] = useState<ReturnExchangeTab>(initialTab);
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState<ReturnableSaleSnapshot[]>([]);
  const [sale, setSale] = useState<ReturnableSaleSnapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("cash");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ReplacementDraft[]>([]);
  const [replacements, setReplacements] = useState<ReplacementDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReturnReceiptSnapshot | null>(null);

  useEffect(() => {
    void loadSales("", initialSaleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSaleId]);

  async function loadSales(query: string, saleId?: string) {
    try {
      setError(null);
      const rows = await lookupReturnableSales(query, saleId);
      setSales(rows);
      const selected = saleId ? rows.find((row) => row.id === saleId) ?? rows[0] : null;
      if (selected) {
        selectSale(selected);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : tPos("ui.sale.lookup.failed"));
    }
  }

  function selectSale(next: ReturnableSaleSnapshot) {
    setSale(next);
    setDrafts(Object.fromEntries(next.items.map((item) => [item.id, emptyDraft(item)])));
    setReplacements([]);
    setReceipt(null);
    setError(null);
  }

  const selectedReturns = useMemo(() => {
    if (!sale) return [];
    return sale.items.flatMap((item) => {
      const draft = drafts[item.id];
      if (!draft?.selected || draft.quantity <= 0 || item.remainingQuantity <= 0) return [];
      return [{ item, draft }];
    });
  }, [drafts, sale]);

  const returnValueLak = selectedReturns.reduce((total, row) => {
    if (row.item.remainingQuantity <= 0) return total;
    const share = row.item.remainingPaidLak * (row.draft.quantity / row.item.remainingQuantity);
    return total + Math.round(share);
  }, 0);
  const replacementTotalLak = replacements.reduce((total, item) => total + Math.round(item.sellingPriceLak * item.quantity), 0);
  const differenceLak = replacementTotalLak - returnValueLak;

  async function searchProducts() {
    try {
      setProductResults((await lookupExchangeProducts(productQuery)).map((product) => ({ ...product, quantity: 1 })));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : tPos("ui.product.search.failed"));
    }
  }

  async function submitReturn() {
    if (!sale || busy) return;
    if (selectedReturns.length === 0) {
      setError(tPos("ui.select.returned.item"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await returnSaleRequest(sale.id, {
        items: selectedReturns.map((row) => ({
          condition: row.draft.condition,
          quantity: row.draft.quantity,
          reason: row.draft.reason || reason,
          saleItemId: row.item.id,
        })),
        reason,
        refundMethod: method,
      });
      if (result.status === "pending_approval") {
        onCompleted(fillPosCopy(tPos("ui.pending.for"), { action: tPos("ui.return.and.refund"), saleNo: sale.saleNo }));
        return;
      }
      setReceipt(result.receipt ?? null);
      onCompleted(fillPosCopy(tPos("ui.sale.returned"), { saleNo: sale.saleNo, amount: formatLak(returnValueLak) }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tPos("ui.return.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitExchange() {
    if (!sale || busy) return;
    if (selectedReturns.length === 0 || replacements.length === 0) {
      setError(tPos("ui.select.returned.and.replacement"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await exchangeSaleRequest(sale.id, {
        paidAmountLak: Math.max(differenceLak, 0),
        reason,
        refundMethod: method,
        replacementItems: replacements.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          unitId: item.unitId,
        })),
        returnedItems: selectedReturns.map((row) => ({
          condition: row.draft.condition,
          quantity: row.draft.quantity,
          reason: row.draft.reason || reason,
          saleItemId: row.item.id,
        })),
      });
      if (result.status === "pending_approval") {
        onCompleted(fillPosCopy(tPos("ui.pending.for"), { action: tPos("ui.exchange"), saleNo: sale.saleNo }));
        return;
      }
      setReceipt(result.receipt ?? null);
      onCompleted(fillPosCopy(tPos("ui.sale.exchanged"), { saleNo: sale.saleNo, amount: formatLak(result.differenceLak ?? differenceLak) }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tPos("ui.exchange.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitVoid(approval?: PostSaleManagerApprovalPayload) {
    if (!sale || busy) return;
    if (!reason.trim()) {
      setError(tPos("ui.void.reason.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await voidSaleRequest(sale.id, reason, approval);
      if (result.status === "pending_approval") {
        onCompleted(fillPosCopy(tPos("ui.pending.for"), { action: tPos("ui.void.sale"), saleNo: sale.saleNo }));
        return;
      }
      onCompleted(fillPosCopy(tPos("ui.sale.voided.stock"), { saleNo: sale.saleNo }));
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tPos("ui.void.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosWorkspaceModal onClose={onClose} title={tPos("ui.return.exchange.void")}>
      {receipt ? (
        <ReturnReceiptView receipt={receipt} onClose={onClose} />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["return", tPos("ui.return.and.refund")],
              ["exchange", tPos("ui.exchange")],
              ["void", tPos("ui.void.sale")],
            ] as const).map(([value, label]) => (
              <button
                className={cn("h-11 rounded-md border px-3 text-sm font-semibold", tab === value ? "border-primary bg-primary/10 text-primary" : "border-border")}
                key={value}
                type="button"
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="grid gap-2">
              <label className="grid gap-1 text-sm font-semibold">
                {tPos("ui.receipt.sale.search")}
                <input
                  className="field-input h-11"
                  placeholder={tPos("ui.search.sales.placeholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadSales(search);
                    }
                  }}
                />
              </label>
              <button className="h-10 rounded-md border border-border text-sm font-semibold" type="button" onClick={() => void loadSales(search)}>
                {tPos("ui.search.sales")}
              </button>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                {sales.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">{tPos("ui.search.or.select.sale")}</p>
                ) : sales.map((row) => (
                  <button
                    className={cn("block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0", sale?.id === row.id ? "bg-primary/10" : "bg-background")}
                    key={row.id}
                    type="button"
                    onClick={() => selectSale(row)}
                  >
                    <span className="font-mono font-semibold">{row.saleNo}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{row.status}</span>
                    <div className="text-xs text-muted-foreground">{row.receiptNo} · {formatLak(row.originalTotalLak)} LAK</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-3">
              {!sale ? (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">{tPos("ui.select.original.sale")}</div>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold">{sale.saleNo}</p>
                        <p className="text-xs text-muted-foreground">{sale.receiptNo} · {sale.customerName} · {sale.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{tPos("ui.remaining.refundable")}</p>
                        <p className="font-semibold">{formatLak(sale.remainingRefundableLak)} LAK</p>
                      </div>
                    </div>
                  </div>

                  {tab !== "void" ? (
                    <div className="grid gap-2">
                      {sale.items.map((item) => {
                        const draft = drafts[item.id] ?? emptyDraft(item);
                        const disabled = item.remainingQuantity <= 0;
                        return (
                          <div className="rounded-md border border-border p-3" key={item.id}>
                            <label className="flex items-start gap-2 text-sm">
                              <input
                                checked={draft.selected}
                                disabled={disabled}
                                type="checkbox"
                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, selected: event.target.checked } }))}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-semibold">
                                  {localizedProductName(item)}
                                  {item.unitName ? ` — ${item.unitName}` : ""}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {fillPosCopy(tPos("ui.remaining.line"), { remain: item.remainingQuantity, total: item.originalQuantity, amount: formatLak(item.remainingPaidLak) })}
                                </span>
                              </span>
                            </label>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <input
                                className="field-input h-10"
                                disabled={disabled}
                                max={item.remainingQuantity}
                                min={0}
                                step={1}
                                type="number"
                                value={draft.quantity}
                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, quantity: Number(event.target.value) } }))}
                              />
                              <select
                                className="field-input h-10"
                                value={draft.condition}
                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, condition: event.target.value as ReturnItemCondition } }))}
                              >
                                {CONDITIONS.map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}
                              </select>
                              <input
                                className="field-input h-10"
                                placeholder={tPos("ui.item.reason")}
                                value={draft.reason}
                                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, reason: event.target.value } }))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {tab === "exchange" ? (
                    <div className="grid gap-2 rounded-md border border-border p-3">
                      <p className="text-sm font-semibold">{tPos("ui.replacement.products")}</p>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          className="field-input h-11"
                          placeholder={tPos("ui.search.replacement")}
                          value={productQuery}
                          onChange={(event) => setProductQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void searchProducts();
                            }
                          }}
                        />
                        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => void searchProducts()}>
                          {tPos("ui.search")}
                        </button>
                      </div>
                      {productResults.map((product) => (
                        <button
                          className="rounded-md border border-border px-3 py-2 text-left text-sm"
                          key={`${product.id}-${product.unitId ?? "u"}`}
                          type="button"
                          onClick={() => setReplacements((current) => {
                            const existing = current.find((row) => row.id === product.id && row.unitId === product.unitId);
                            if (existing) {
                              return current.map((row) => row === existing ? { ...row, quantity: row.quantity + 1 } : row);
                            }
                            return [...current, { ...product, quantity: 1 }];
                          })}
                        >
                          {localizedProductName(product)} · {formatLak(product.sellingPriceLak)} LAK
                        </button>
                      ))}
                      {replacements.map((item, index) => (
                        <div className="flex items-center justify-between gap-2 text-sm" key={`${item.id}-${index}`}>
                          <span>{localizedProductName(item)}</span>
                          <input
                            className="field-input h-9 w-20"
                            min={1}
                            type="number"
                            value={item.quantity}
                            onChange={(event) => setReplacements((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))}
                          />
                        </div>
                      ))}
                      <div className="rounded-md bg-muted/40 p-3 text-sm">
                        <p>{tPos("ui.original.return.value")}: {formatLak(returnValueLak)} LAK</p>
                        <p>{tPos("ui.new.item.total")}: {formatLak(replacementTotalLak)} LAK</p>
                        <p className="font-semibold">
                          {differenceLak > 0 ? fillPosCopy(tPos("ui.customer.pays"), { amount: formatLak(differenceLak) }) : differenceLak < 0 ? fillPosCopy(tPos("ui.store.refunds"), { amount: formatLak(Math.abs(differenceLak)) }) : tPos("ui.equal.exchange")}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <label className="grid gap-1 text-sm font-semibold">
                    {tPos("ui.reason")}
                    <textarea className="field-input min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  {tab !== "void" ? (
                    <label className="grid gap-1 text-sm font-semibold">
                      {tab === "exchange" ? tPos("ui.difference.method") : tPos("ui.refund.method")}
                      <select className="field-input h-11" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
                        {METHODS.map((option) => <option key={option.value} value={option.value}>{option.value === "qr" ? "QR" : tPos(option.key)}</option>)}
                      </select>
                    </label>
                  ) : null}

                  {error ? <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{tPos("ui.cancel")}</button>
                    {tab === "return" ? (
                      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitReturn()}>
                        {tPos("ui.confirm.return")}
                      </button>
                    ) : null}
                    {tab === "exchange" ? (
                      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitExchange()}>
                        {tPos("ui.confirm.exchange")}
                      </button>
                    ) : null}
                    {tab === "void" ? (
                      <button className="h-11 rounded-md bg-danger px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitVoid()}>
                        {tPos("ui.confirm.void")}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PosWorkspaceModal>
  );
}

function ReturnReceiptView({ onClose, receipt }: { onClose: () => void; receipt: ReturnReceiptSnapshot }) {
  const title = receipt.kind === "exchange" ? tPos("ui.exchange.receipt") : tPos("ui.return.receipt");
  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-border bg-background p-5 font-mono text-sm">
        <div className="text-center text-lg font-bold">{title}</div>
        <div className="mt-2 text-center">
          <div>{tPos("ui.original")}: {receipt.originalSaleNo} / {receipt.originalReceiptNo}</div>
          <div>{tPos("ui.document")}: {receipt.receiptNo}</div>
          <div>{new Date(receipt.createdAt).toLocaleString()}</div>
          <div>{tPos("ui.user")}: {receipt.createdBy}{receipt.approvedBy ? ` · ${tPos("ui.approver")}: ${receipt.approvedBy}` : ""}</div>
          <div>{tPos("ui.method")}: {receipt.method.toUpperCase()}</div>
          {receipt.reason ? <div>{tPos("ui.reason")}: {receipt.reason}</div> : null}
        </div>
        <div className="my-4 border-t border-dashed border-border" />
        {receipt.returnedItems.map((item, index) => (
          <div className="flex justify-between gap-3" key={`ret-${index}`}>
            <span>
              {localizedProductName(item)}
              {item.unitName ? ` — ${item.unitName}` : ""}
              {" "}x{item.quantity} ({conditionLabel(item.condition)})
            </span>
            <span>{formatLak(item.amountLak)}</span>
          </div>
        ))}
        {receipt.replacementItems.length > 0 ? (
          <>
            <div className="my-4 border-t border-dashed border-border" />
            {receipt.replacementItems.map((item, index) => (
              <div className="flex justify-between gap-3" key={`ex-${index}`}>
                <span>{localizedProductName(item)} x{item.quantity}</span>
                <span>{formatLak(item.totalAmountLak)}</span>
              </div>
            ))}
          </>
        ) : null}
        <div className="my-4 border-t border-dashed border-border" />
        <div className="flex justify-between"><span>{tPos("ui.refunded")}</span><span>{formatLak(receipt.refundAmountLak)} LAK</span></div>
        <div className="flex justify-between"><span>{tPos("ui.additional.paid")}</span><span>{formatLak(receipt.paymentAmountLak)} LAK</span></div>
        <div className="flex justify-between font-bold"><span>{tPos("ui.difference")}</span><span>{formatLak(receipt.differenceLak)} LAK</span></div>
      </div>
      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground print:hidden" type="button" onClick={() => window.print()}>{tPos("ui.print.receipt")}</button>
      <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold print:hidden" type="button" onClick={onClose}>{tPos("ui.close")}</button>
    </div>
  );
}
