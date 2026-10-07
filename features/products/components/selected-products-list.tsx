import type { ReactNode } from "react";

export const selectedProductsListClassName = "max-h-[52vh] min-h-60 overflow-auto rounded-lg border border-border bg-white";
export const selectedProductsRowClassName = "grid items-center gap-x-3 border-b border-border bg-white px-3 py-2 text-sm last:border-b-0";
export const selectedProductsPrintGridClassName = "grid-cols-[minmax(0,1.6fr)_5.5rem_minmax(0,1fr)_7.5rem_4.75rem]";
export const selectedProductsPriceGridClassName = "grid-cols-[minmax(0,1.35fr)_4.75rem_minmax(0,0.9fr)_6rem_7.5rem_8rem_4.75rem]";

export function SelectedProductsList({ children }: { children: ReactNode }) {
  return (
    <div className={selectedProductsListClassName} data-testid="products-selected-list">
      <div className="min-w-[920px]">{children}</div>
    </div>
  );
}
