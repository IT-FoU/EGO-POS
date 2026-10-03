"use client";

import { createContext, useContext, type ReactNode } from "react";

const ReportExportContext = createContext(true);

export function ReportExportProvider({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <ReportExportContext.Provider value={allowed}>{children}</ReportExportContext.Provider>;
}

export function useReportExportAllowed() {
  return useContext(ReportExportContext);
}
