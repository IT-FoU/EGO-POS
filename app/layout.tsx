import type { Metadata } from "next";
import "./globals.css";
import { LocalizationRepairRuntime } from "@/components/i18n/localization-repair-runtime";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "EGO POS",
  description: "????. ??????. ??.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lo" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <LocalizationRepairRuntime />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
