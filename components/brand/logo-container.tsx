import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const supportedLogoPattern = /\.(png|svg|webp)(\?.*)?$/i;
const supportedDataLogoPattern = /^data:image\/(png|svg\+xml|webp);/i;

export function LogoContainer({
  alt = "Company logo",
  className,
  logoUrl,
  size = 64,
}: {
  alt?: string;
  className?: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const hasSupportedLogo = Boolean(
    logoUrl && (supportedLogoPattern.test(logoUrl) || supportedDataLogoPattern.test(logoUrl)),
  );

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background text-center shadow-sm",
        className,
      )}
      style={{ minHeight: size, minWidth: size }}
    >
      {hasSupportedLogo && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="h-full w-full object-contain"
          src={logoUrl}
        />
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
