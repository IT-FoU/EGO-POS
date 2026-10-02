import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="suppliers">{children}</ModuleAccessGate>;
}
