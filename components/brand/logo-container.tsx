"use client";

import { useState, type CSSProperties } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSupportedCompanyLogoUrl, storeInitials } from "@/features/brand/company-logo";

export const CUSTOMER_DISPLAY_LOGO_MAX_HEIGHT = 56;
export const CUSTOMER_DISPLAY_LOGO_MAX_WIDTH = 104;
export const SETTINGS_LOGO_PREVIEW_MAX_HEIGHT = 120;
export const SETTINGS_LOGO_PREVIEW_MAX_WIDTH = 200;
export const SIDEBAR_LOGO_MAX_SIZE = 56;

export type LogoSurface = "admin" | "customer" | "settings" | "sidebar";

export function LogoContainer({
  alt = "Company logo",
  className,
  fallbackName,
  logoUrl,
  size = 64,
  variant = "admin",
}: {
  alt?: string;
  className?: string;
  fallbackName?: string | null;
  logoUrl?: string | null;
  size?: number;
  variant?: LogoSurface;
}) {
  const [broken, setBroken] = useState(false);
  const hasSupportedLogo = Boolean(logoUrl && isSupportedCompanyLogoUrl(logoUrl) && !broken);
  const box = logoBoxStyle(variant, size);

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background text-center shadow-sm",
        variant === "customer" && "max-h-[56px] max-w-[104px]",
        variant === "settings" && "max-h-[120px] max-w-[200px]",
        variant === "sidebar" && "max-h-14 max-w-14",
        className,
      )}
      data-cd-logo={variant === "customer" ? "bounded" : variant}
      style={box}
    >
      {hasSupportedLogo && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="h-full max-h-full w-full max-w-full object-contain"
          src={logoUrl}
          onError={() => setBroken(true)}
        />
      ) : variant === "customer" || variant === "sidebar" ? (
        <div className="flex h-full w-full items-center justify-center text-lg font-black" aria-hidden="true">
          {storeInitials(fallbackName)}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-2 text-muted-foreground">
          <ImagePlus className="size-5" aria-hidden="true" />
          <div className="text-xs font-semibold">[ Logo ]</div>
          <div className="max-w-24 text-[10px] leading-3">Upload Company Logo</div>
        </div>
      )}
    </div>
  );
}

function logoBoxStyle(variant: LogoSurface, size: number): CSSProperties {
  if (variant === "customer") {
    const customerHeight = Math.min(size, CUSTOMER_DISPLAY_LOGO_MAX_HEIGHT);
    const customerWidth = Math.min(Math.round(customerHeight * 1.75), CUSTOMER_DISPLAY_LOGO_MAX_WIDTH);
    return {
      height: customerHeight,
      maxHeight: customerHeight,
      maxWidth: customerWidth,
      minHeight: customerHeight,
      minWidth: Math.min(customerHeight, customerWidth),
      width: customerWidth,
    };
  }

  if (variant === "settings") {
    return {
      height: SETTINGS_LOGO_PREVIEW_MAX_HEIGHT,
      maxHeight: SETTINGS_LOGO_PREVIEW_MAX_HEIGHT,
      maxWidth: SETTINGS_LOGO_PREVIEW_MAX_WIDTH,
      minHeight: SETTINGS_LOGO_PREVIEW_MAX_HEIGHT,
      minWidth: 160,
      width: SETTINGS_LOGO_PREVIEW_MAX_WIDTH,
    };
  }

  const sidebarSize = variant === "sidebar" ? Math.min(size, SIDEBAR_LOGO_MAX_SIZE) : size;
  return {
    height: sidebarSize,
    maxHeight: sidebarSize,
    maxWidth: sidebarSize,
    minHeight: sidebarSize,
    minWidth: sidebarSize,
    width: sidebarSize,
  };
}
