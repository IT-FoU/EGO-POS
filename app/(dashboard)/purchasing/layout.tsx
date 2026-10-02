import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function PurchasingLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="purchasing">{children}</ModuleAccessGate>;
}
