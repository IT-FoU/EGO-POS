import { SettingsIndexScrollGuard } from "@/features/settings/components/settings-index-scroll-guard";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsIndexScrollGuard />
      {children}
    </>
  );
}
