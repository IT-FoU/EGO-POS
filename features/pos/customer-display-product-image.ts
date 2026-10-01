import type { PosCartItem } from "@/features/pos/types";
import { isRenderableImageUrl } from "@/lib/storage/product-image-ref";

export type CustomerDisplayProductImageSource =
  | "base-main"
  | "base-thumbnail"
  | "unit-main"
  | "unit-thumbnail"
  | "placeholder";

export type CustomerDisplayProductImage = {
  source: CustomerDisplayProductImageSource;
  url?: string;
};

function usableImage(url?: string | null) {
  return isRenderableImageUrl(url) ? url : undefined;
}

/**
 * Resolve only the sold unit identified by unitId. In particular, do not use
 * PosCartItem.unitImageUrl here because that field may be a catalogue-card
 * fallback for a different/default unit.
 */
export function resolveCustomerDisplayProductImage(item: PosCartItem): CustomerDisplayProductImage {
  const soldUnit = item.units?.find((unit) => unit.id === item.unitId);
  const unitThumbnail = usableImage(soldUnit?.imageThumbUrl);
  if (unitThumbnail) {
    return { source: "unit-thumbnail", url: unitThumbnail };
  }

  const unitMain = usableImage(soldUnit?.imageUrl);
  if (unitMain) {
    return { source: "unit-main", url: unitMain };
  }

  const baseThumbnail = usableImage(item.productThumbnailUrl);
  if (baseThumbnail) {
    return { source: "base-thumbnail", url: baseThumbnail };
  }

  const baseMain = usableImage(item.productImageUrl);
  if (baseMain) {
    return { source: "base-main", url: baseMain };
  }

  return { source: "placeholder" };
}
