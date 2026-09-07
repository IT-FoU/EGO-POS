"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck, Save } from "lucide-react";
import type { PurchaseOrder } from "@/features/purchasing/types";
import type { Warehouse } from "@/features/inventory/types";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { PurchaseStatusBadge } from "@/features/purchasing/components/purchasing-status";
import { receiveGoodsAction } from "@/features/purchasing/actions";
import { localizedProductName } from "@/features/pos/product-display-name";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";
import { localizePurchasingError, tPurchasing } from "@/lib/i18n/purchasing-copy";

type ReceiveLine = {
  expiryDate: string;
  id: string;
  lotNumber: string;
  receiveQuantity: number;
};

function purchaseItemName(item: PurchaseOrder["items"][number], locale: SupportedLocale) {
  if (item.productNameEn || item.productNameLo) {
    return localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale);
  }
  return item.productName;
}

export function ReceivingPageClient({
  locale: localeProp,
  purchaseOrders,
  warehouses,
}: {
  locale?: SupportedLocale;
  purchaseOrders: PurchaseOrder[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [locale, setLocale] = useState<SupportedLocale>(localeProp ?? readClientLocale());
  const receivableOrders = purchaseOrders.filter((order) => order.status === "ordered" || order.status === "partial");
  const [selectedOrderId, setSelectedOrderId] = useState(receivableOrders[0]?.id ?? "");
  const selectedOrder = receivableOrders.find((order) => order.id === selectedOrderId) ?? receivableOrders[0];
  const [warehouseId, setWarehouseId] = useState(selectedOrder?.warehouseId ?? warehouses[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>(
    () =>
      selectedOrder?.items.map((item) => ({
        expiryDate: item.expiryDate ?? "",
        id: item.id,
        lotNumber: item.lotNumber ?? "",
        receiveQuantity: Math.max(item.quantity - item.receivedQuantity, 0),
      })) ?? [],
  );
  const t = (key: string) => tPurchasing(key, locale);

  useEffect(() => {
    if (localeProp) setLocale(localeProp);
  }, [localeProp]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
      if (isSupportedLocale(detail?.locale)) setLocale(detail.locale);
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  const progress = useMemo(() => {
    if (!selectedOrder) return { ordered: 0, received: 0, receiving: 0 };
    const ordered = selectedOrder.items.reduce((total, item) => total + item.quantity, 0);
    const received = selectedOrder.items.reduce((total, item) => total + item.receivedQuantity, 0);
    const receiving = receiveLines.reduce((total, line) => total + line.receiveQuantity, 0);
    return { ordered, received, receiving };
  }, [receiveLines, selectedOrder]);

  function selectOrder(orderId: string) {
    const order = receivableOrders.find((item) => item.id === orderId);
    setSelectedOrderId(orderId);
    setWarehouseId(order?.warehouseId ?? warehouses[0]?.id ?? "");
    setReceiveLines(
      order?.items.map((item) => ({
        expiryDate: item.expiryDate ?? "",
        id: item.id,
        lotNumber: item.lotNumber ?? "",
        receiveQuantity: Math.max(item.quantity - item.receivedQuantity, 0),
      })) ?? [],
    );
  }

  function updateLine(lineId: string, patch: Partial<ReceiveLine>) {
    setReceiveLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) {
      setMessage(t("selectPoFirst"));
      return;
    }
    const items = receiveLines
      .filter((line) => line.receiveQuantity > 0)
      .map((line) => {
        const orderItem = selectedOrder.items.find((item) => item.id === line.id);
        return {
          expiryDate: line.expiryDate || undefined,
          lotNumber: line.lotNumber || undefined,
          productId: orderItem?.productId ?? "",
          purchaseItemId: line.id,
          quantity: line.receiveQuantity,
        };
      })
      .filter((item) => item.productId);
    if (items.length === 0) {
      setMessage(t("enterReceiveQuantity"));
      return;
    }
    startTransition(async () => {
      const result = await receiveGoodsAction({
        items,
        purchaseId: selectedOrder.id,
        receiptNo: `GR-${Date.now()}`,
        status: "received",
        warehouseId,
      });
      if (!result.ok) {
        setMessage(localizePurchasingError(result.error ?? t("goodsReceivingFailed"), locale));
        return;
      }
      setMessage(t("goodsReceivedSuccessfully"));
      router.refresh();
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/purchasing">
          <ArrowLeft aria-hidden="true" />
          {t("backToPurchasing")}
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <PackageCheck aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{t("receivingGoods")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("receivingSubtitle")}</p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            disabled={isPending}
            type="submit"
          >
            <Save aria-hidden="true" />
            {isPending ? t("saving") : t("saveReceive")}
          </button>
        </div>
      </section>

      {message ? <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("purchaseOrder")}
              <select className="field-input" value={selectedOrderId} onChange={(event) => selectOrder(event.target.value)}>
                {receivableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.purchaseNo} - {order.supplierName}
                  </option>
                ))}
              </select>
            </label>
            <WarehouseSelector locale={locale} selectedWarehouseId={warehouseId} warehouses={warehouses} onChange={setWarehouseId} />
          </div>

          {selectedOrder ? (
            <>
              <div className="mt-5 flex flex-col gap-3 rounded-md border border-border bg-background p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">{selectedOrder.supplierName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedOrder.purchaseNo} - {selectedOrder.purchaseDate}
                  </div>
                </div>
                <PurchaseStatusBadge locale={locale} status={selectedOrder.status} />
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">{t("product")}</th>
                      <th className="px-3 py-3">{t("barcodeSku")}</th>
                      <th className="px-3 py-3">{t("ordered")}</th>
                      <th className="px-3 py-3">{t("received")}</th>
                      <th className="px-3 py-3">{t("receiveNow")}</th>
                      <th className="px-3 py-3">{t("lot")}</th>
                      <th className="px-3 py-3">{t("expiry")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item) => {
                      const line = receiveLines.find((entry) => entry.id === item.id);
                      const remaining = Math.max(item.quantity - item.receivedQuantity, 0);
                      return (
                        <tr className="border-b border-border last:border-b-0" key={item.id}>
                          <td className="px-3 py-3">
                            <div className="font-semibold">{purchaseItemName(item, locale)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{item.unitName}</div>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                            {item.barcode}
                            <br />
                            {item.sku}
                          </td>
                          <td className="px-3 py-3">{item.quantity}</td>
                          <td className="px-3 py-3">{item.receivedQuantity}</td>
                          <td className="px-3 py-3">
                            <input
                              className="field-input h-10"
                              max={remaining}
                              min="0"
                              type="number"
                              value={line?.receiveQuantity ?? 0}
                              onChange={(event) => updateLine(item.id, { receiveQuantity: Number(event.target.value) })}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className="field-input h-10 font-mono"
                              value={line?.lotNumber ?? ""}
                              onChange={(event) => updateLine(item.id, { lotNumber: event.target.value })}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              className="field-input h-10"
                              type="date"
                              value={line?.expiryDate ?? ""}
                              onChange={(event) => updateLine(item.id, { expiryDate: event.target.value })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{t("noReceivableOrders")}</p>
          )}
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("receiveSummary")}</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label={t("orderedQuantity")} value={String(progress.ordered)} />
            <Summary label={t("alreadyReceived")} value={String(progress.received)} />
            <Summary label={t("receivingNow")} value={String(progress.receiving)} />
            <Summary label={t("projectedReceived")} value={String(progress.received + progress.receiving)} />
            <Summary label={t("databaseStatus")} value={t("realDatabase")} />
          </dl>
        </aside>
      </section>
    </form>
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
