"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSupportedCompanyLogoUrl, storeInitials } from "@/features/brand/company-logo";

export const CUSTOMER_DISPLAY_LOGO_MAX_HEIGHT = 56;
export const CUSTOMER_DISPLAY_LOGO_MAX_WIDTH = 104;

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
  variant?: "admin" | "customer";
}) {
  const [broken, setBroken] = useState(false);
  const hasSupportedLogo = Boolean(logoUrl && isSupportedCompanyLogoUrl(logoUrl) && !broken);
  const isCustomer = variant === "customer";
  const customerHeight = Math.min(size, CUSTOMER_DISPLAY_LOGO_MAX_HEIGHT);
  const customerWidth = Math.min(Math.round(customerHeight * 1.75), CUSTOMER_DISPLAY_LOGO_MAX_WIDTH);

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background text-center shadow-sm",
        isCustomer && "max-h-[56px] max-w-[104px]",
        className,
      )}
      data-cd-logo={isCustomer ? "bounded" : "admin"}
      style={
        isCustomer
          ? {
              height: customerHeight,
              maxHeight: customerHeight,
              maxWidth: customerWidth,
              minHeight: customerHeight,
              minWidth: Math.min(customerHeight, customerWidth),
              width: customerWidth,
            }
          : { minHeight: size, minWidth: size }
      }
    >
      {hasSupportedLogo && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="h-full max-h-full w-full max-w-full object-contain"
          src={logoUrl}
          onError={() => setBroken(true)}
        />
      ) : isCustomer ? (
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
