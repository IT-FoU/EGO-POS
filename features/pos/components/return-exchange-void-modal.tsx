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
import { cn } from "@/lib/utils";

export type ReturnExchangeTab = "return" | "exchange" | "void";

type ReturnExchangeVoidModalProps = {
  initialSaleId?: string;
  initialTab?: ReturnExchangeTab;
  onClose: () => void;
  onCompleted: (message: string) => void;
};

const CONDITIONS: Array<{ label: string; value: ReturnItemCondition }> = [
  { label: "Sellable", value: "sellable" },
  { label: "Damaged", value: "damaged" },
  { label: "Expired", value: "expired" },
  { label: "Opened / Used", value: "opened_used" },
];

const METHODS = [
  { label: "Cash", value: "cash" },
  { label: "Transfer", value: "transfer" },
  { label: "QR", value: "qr" },
  { label: "Card", value: "visa" },
] as const;

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
      setError(loadError instanceof Error ? loadError.message : "Sale lookup failed.");
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
      setError(searchError instanceof Error ? searchError.message : "Product search failed.");
    }
  }

  async function submitReturn() {
    if (!sale || busy) return;
    if (selectedReturns.length === 0) {
      setError("Select at least one returned item.");
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
        onCompleted(`Return pending approval for ${sale.saleNo}.`);
        return;
      }
      setReceipt(result.receipt ?? null);
      onCompleted(`${sale.saleNo} returned ${formatLak(returnValueLak)} LAK.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Return failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitExchange() {
    if (!sale || busy) return;
    if (selectedReturns.length === 0 || replacements.length === 0) {
      setError("Select returned items and at least one replacement product.");
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
        onCompleted(`Exchange pending approval for ${sale.saleNo}.`);
        return;
      }
      setReceipt(result.receipt ?? null);
      onCompleted(`${sale.saleNo} exchanged. Difference ${formatLak(result.differenceLak ?? differenceLak)} LAK.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Exchange failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVoid(approval?: PostSaleManagerApprovalPayload) {
    if (!sale || busy) return;
    if (!reason.trim()) {
      setError("A void reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await voidSaleRequest(sale.id, reason, approval);
      if (result.status === "pending_approval") {
        onCompleted(`Void pending approval for ${sale.saleNo}.`);
        return;
      }
      onCompleted(`${sale.saleNo} voided. Stock restored.`);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Void failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosWorkspaceModal onClose={onClose} title="Return / Exchange / Void">
      {receipt ? (
        <ReturnReceiptView receipt={receipt} onClose={onClose} />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["return", "Return & Refund"],
              ["exchange", "Exchange"],
              ["void", "Void Sale"],
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
                Receipt / sale search
                <input
                  className="field-input h-11"
                  placeholder="Receipt no, sale no, customer, barcode"
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
                Search sales
              </button>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                {sales.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Search or select a completed sale.</p>
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
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">Select an original completed sale. The original bill is never edited or deleted.</div>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold">{sale.saleNo}</p>
                        <p className="text-xs text-muted-foreground">{sale.receiptNo} · {sale.customerName} · {sale.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Remaining refundable</p>
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
                                <span className="font-semibold">{item.nameEn}</span>
                                <span className="block text-xs text-muted-foreground">
                                  Remaining {item.remainingQuantity}/{item.originalQuantity} · {formatLak(item.remainingPaidLak)} LAK original paid
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
                                {CONDITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                              <input
                                className="field-input h-10"
                                placeholder="Item reason"
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
                      <p className="text-sm font-semibold">Replacement products</p>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          className="field-input h-11"
                          placeholder="Search or scan replacement SKU/barcode"
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
                          Search
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
                          {product.nameEn} · {formatLak(product.sellingPriceLak)} LAK
                        </button>
                      ))}
                      {replacements.map((item, index) => (
                        <div className="flex items-center justify-between gap-2 text-sm" key={`${item.id}-${index}`}>
                          <span>{item.nameEn}</span>
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
                        <p>Original return value: {formatLak(returnValueLak)} LAK</p>
                        <p>New item total: {formatLak(replacementTotalLak)} LAK</p>
                        <p className="font-semibold">
                          {differenceLak > 0 ? `Customer pays ${formatLak(differenceLak)} LAK` : differenceLak < 0 ? `Store refunds ${formatLak(Math.abs(differenceLak))} LAK` : "Equal exchange: 0 LAK"}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <label className="grid gap-1 text-sm font-semibold">
                    Reason
                    <textarea className="field-input min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  {tab !== "void" ? (
                    <label className="grid gap-1 text-sm font-semibold">
                      {tab === "exchange" ? "Difference method" : "Refund method"}
                      <select className="field-input h-11" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
                        {METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  ) : null}

                  {error ? <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
                    {tab === "return" ? (
                      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitReturn()}>
                        Confirm return
                      </button>
                    ) : null}
                    {tab === "exchange" ? (
                      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitExchange()}>
                        Confirm exchange
                      </button>
                    ) : null}
                    {tab === "void" ? (
                      <button className="h-11 rounded-md bg-danger px-4 text-sm font-semibold text-primary-foreground" disabled={busy} type="button" onClick={() => void submitVoid()}>
                        Confirm void
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
  const title = receipt.kind === "exchange" ? "Exchange Receipt" : "Return / Refund Receipt";
  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-border bg-background p-5 font-mono text-sm">
        <div className="text-center text-lg font-bold">{title}</div>
        <div className="mt-2 text-center">
          <div>Original: {receipt.originalSaleNo} / {receipt.originalReceiptNo}</div>
          <div>Document: {receipt.receiptNo}</div>
          <div>{new Date(receipt.createdAt).toLocaleString()}</div>
          <div>User: {receipt.createdBy}{receipt.approvedBy ? ` · Approver: ${receipt.approvedBy}` : ""}</div>
          <div>Method: {receipt.method.toUpperCase()}</div>
          {receipt.reason ? <div>Reason: {receipt.reason}</div> : null}
        </div>
        <div className="my-4 border-t border-dashed border-border" />
        {receipt.returnedItems.map((item, index) => (
          <div className="flex justify-between gap-3" key={`ret-${index}`}>
            <span>{item.nameEn} x{item.quantity} ({item.condition})</span>
            <span>{formatLak(item.amountLak)}</span>
          </div>
        ))}
        {receipt.replacementItems.length > 0 ? (
          <>
            <div className="my-4 border-t border-dashed border-border" />
            {receipt.replacementItems.map((item, index) => (
              <div className="flex justify-between gap-3" key={`ex-${index}`}>
                <span>{item.nameEn} x{item.quantity}</span>
                <span>{formatLak(item.totalAmountLak)}</span>
              </div>
            ))}
          </>
        ) : null}
        <div className="my-4 border-t border-dashed border-border" />
        <div className="flex justify-between"><span>Refunded</span><span>{formatLak(receipt.refundAmountLak)} LAK</span></div>
        <div className="flex justify-between"><span>Additional paid</span><span>{formatLak(receipt.paymentAmountLak)} LAK</span></div>
        <div className="flex justify-between font-bold"><span>Difference</span><span>{formatLak(receipt.differenceLak)} LAK</span></div>
      </div>
      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground print:hidden" type="button" onClick={() => window.print()}>Print</button>
      <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold print:hidden" type="button" onClick={onClose}>Close</button>
    </div>
  );
}
