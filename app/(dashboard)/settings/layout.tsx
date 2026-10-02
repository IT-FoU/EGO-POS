import { SettingsIndexScrollGuard } from "@/features/settings/components/settings-index-scroll-guard";
import { BackOfficeAccessGate } from "@/components/auth/back-office-access-gate";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackOfficeAccessGate>
      <SettingsIndexScrollGuard />
      {children}
    </BackOfficeAccessGate>
  );
}
