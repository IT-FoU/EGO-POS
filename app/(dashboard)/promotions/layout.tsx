import { ModuleAccessGate } from "@/components/auth/module-access-gate";

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleAccessGate module="promotions">{children}</ModuleAccessGate>;
}
