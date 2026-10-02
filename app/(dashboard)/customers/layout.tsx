import { BackOfficeAccessGate } from "@/components/auth/back-office-access-gate";

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return <BackOfficeAccessGate>{children}</BackOfficeAccessGate>;
}
