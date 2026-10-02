import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="products">{children}</ModuleAccessGate>;
}
