import type { ReactNode } from "react";

const WHITE_TABLE_CSS = `
.ego-white-table {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  color: #111827;
  color-scheme: light;
}
.ego-white-table table {
  background: #FFFFFF;
  border-collapse: collapse;
  color: #111827;
}
.ego-white-table th,
.ego-white-table td {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  color: #111827;
  min-width: 6.5rem;
  padding: 0.5rem 0.75rem;
  vertical-align: middle;
}
.ego-white-table th:first-child,
.ego-white-table td:first-child { min-width: 12rem; }
.ego-white-table th:last-child,
.ego-white-table td:last-child { border-left-width: 2px; }
.ego-white-table th {
  background: #F8FAFC;
  color: #111827;
  font-weight: 650;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ego-white-table tbody tr:hover td { background: #F1F5F9; }
.ego-white-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.ego-white-table .mid { text-align: center; }
.ego-white-table .ego-muted { color: #475569; }
.ego-white-table .ego-danger { color: #b91c1c; font-weight: 650; }
.ego-white-table .ego-clip {
  display: block;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ego-white-table input:not([type="checkbox"]) {
  background: #FFFFFF;
  border: 1px solid #64748B;
  border-radius: 0.375rem;
  color: #111827;
  height: 2rem;
  min-width: 4.5rem;
  padding: 0 0.5rem;
  width: 100%;
}
.ego-white-table input:not([type="checkbox"]):disabled {
  background: #F8FAFC;
  color: #475569;
}
.ego-white-table input[type="checkbox"] {
  accent-color: #111827;
  height: 1rem;
  width: 1rem;
}
.ego-white-table button.ego-row-remove,
.ego-white-table a.ego-row-action {
  background: #FFFFFF;
  border: 1px solid #b91c1c;
  border-radius: 0.375rem;
  color: #b91c1c;
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 650;
  height: 2rem;
  align-items: center;
  padding: 0 0.5rem;
  text-decoration: none;
}
.ego-white-table button.ego-row-remove:hover { background: #FEF2F2; }
.ego-white-table a.ego-row-open {
  background: #FFFFFF;
  border: 1px solid #475569;
  border-radius: 0.375rem;
  color: #111827;
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 650;
  height: 2rem;
  align-items: center;
  padding: 0 0.5rem;
  text-decoration: none;
}
.ego-white-table a.ego-row-open:hover { background: #F8FAFC; }
.ego-white-table :focus-visible {
  outline: 2px solid #111827;
  outline-offset: 1px;
}
`;

export function WhiteTableText({ children }: { children: string }) {
  return <span className="ego-clip" title={children}>{children}</span>;
}

export function WhiteDataTable({ children, minWidth = "860px", testId = "products-selected-list" }: {
  children: ReactNode;
  minWidth?: string;
  testId?: string;
}) {
  return (
    <div className="ego-white-table max-h-[52vh] min-h-60 overflow-auto rounded-lg bg-white text-neutral-950" data-testid={testId}>
      <style>{WHITE_TABLE_CSS}</style>
      <table className="w-full border-collapse text-left text-sm text-neutral-950" style={{ minWidth }}>{children}</table>
    </div>
  );
}
