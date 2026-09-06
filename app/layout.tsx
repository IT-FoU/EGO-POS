import type { Metadata } from "next";
import { Noto_Sans_Lao } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LocalizationRepairRuntime } from "@/components/i18n/localization-repair-runtime";
import { LocaleBootstrap } from "@/components/i18n/locale-bootstrap";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

const notoSansLao = Noto_Sans_Lao({
  display: "swap",
  subsets: ["lao"],
  variable: "--font-noto-sans-lao",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "EGO POS",
  description: "Simple. Smart. Fast. For Every Business.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value, DEFAULT_LOCALE);

  return (
    <html
      className={locale === "lo" ? `${notoSansLao.className} ${notoSansLao.variable}` : undefined}
      data-locale={locale}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <LocaleBootstrap initialLocale={locale} />
          <LocalizationRepairRuntime />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
