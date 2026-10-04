export type TerminalCard = {
  currentShift: { id: string; openedAt: string } | null;
  id: string;
  isCurrentDevice: boolean;
  lastSeenAt: string | null;
  status: "ACTIVE" | "DISABLED";
  terminalBound: boolean;
  terminalCode: string;
  terminalName: string;
};

export type PosCurrentTerminal = {
  id: string;
  status: "ACTIVE" | "DISABLED";
  terminalCode: string;
  terminalName: string;
};
