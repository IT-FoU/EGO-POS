export const UNMATCHED_TERMINAL_ID = "__none__";

export type CompanyTerminalOption = {
  id: string;
  terminalCode: string;
  terminalName: string;
};

export type TerminalAnalyticsFilter =
  | { mode: "all" }
  | { mode: "one"; terminalId: string }
  | { mode: "none"; terminalId: typeof UNMATCHED_TERMINAL_ID };

export function resolveTerminalAnalyticsFilter(
  terminals: CompanyTerminalOption[],
  raw: string | null | undefined,
): TerminalAnalyticsFilter {
  const value = String(raw ?? "").trim();
  if (!value || value === "all") {
    return { mode: "all" };
  }
  const match = terminals.find((row) => row.id === value);
  if (!match) {
    return { mode: "none", terminalId: UNMATCHED_TERMINAL_ID };
  }
  return { mode: "one", terminalId: match.id };
}

export function terminalFilterId(filter: TerminalAnalyticsFilter) {
  return filter.mode === "all" ? "" : filter.terminalId;
}

export async function listCompanyActiveTerminals(
  client: any,
  companyId: string,
): Promise<CompanyTerminalOption[]> {
  const rows = await client.posTerminal.findMany({
    orderBy: { terminalCode: "asc" },
    select: { id: true, terminalCode: true, terminalName: true },
    where: { companyId, status: "ACTIVE" },
  });
  return rows.map((row: { id: unknown; terminalCode: unknown; terminalName: unknown }) => ({
    id: String(row.id),
    terminalCode: String(row.terminalCode ?? ""),
    terminalName: String(row.terminalName ?? ""),
  }));
}
