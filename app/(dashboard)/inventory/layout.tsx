import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="inventory">{children}</ModuleAccessGate>;
}
