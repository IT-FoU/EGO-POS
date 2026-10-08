import type { ReactNode } from "react";

const WHITE_TABLE_CSS = `
.ego-white-table {
  background: #fff;
  color: #171717;
  color-scheme: light;
  border: 1px solid #d4d4d8;
}
.ego-white-table table {
  background: #fff;
  border-collapse: collapse;
  color: #171717;
}
.ego-white-table th,
.ego-white-table td {
  background: #fff;
  border: 1px solid #d4d4d8;
  color: #171717;
  min-width: 6.5rem;
  padding: 0.5rem 0.75rem;
  vertical-align: middle;
}
.ego-white-table th:first-child,
.ego-white-table td:first-child {
  min-width: 12rem;
}
.ego-white-table th {
  background: #f4f4f5;
  font-weight: 650;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ego-white-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.ego-white-table .mid { text-align: center; }
.ego-white-table .ego-muted { color: #525252; }
.ego-white-table .ego-danger { color: #b91c1c; font-weight: 650; }
.ego-white-table input:not([type="checkbox"]) {
  background: #fff;
  border: 1px solid #737373;
  border-radius: 0.375rem;
  color: #171717;
  height: 2rem;
  min-width: 4.5rem;
  padding: 0 0.5rem;
  width: 100%;
}
.ego-white-table input:not([type="checkbox"]):disabled {
  background: #f4f4f5;
  color: #404040;
}
.ego-white-table button.ego-row-remove,
.ego-white-table a.ego-row-action {
  background: #fff;
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
.ego-white-table a.ego-row-open {
  background: #fff;
  border: 1px solid #525252;
  border-radius: 0.375rem;
  color: #171717;
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 650;
  height: 2rem;
  align-items: center;
  padding: 0 0.5rem;
  text-decoration: none;
}
`;

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
