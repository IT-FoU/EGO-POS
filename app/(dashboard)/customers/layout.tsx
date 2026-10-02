import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="customers">{children}</ModuleAccessGate>;
}
