export const POS_CATALOGUE_INVALIDATION_KEY = "ego-pos.catalogue.invalidation";
export const POS_CATALOGUE_CHANNEL = "ego-pos-catalogue";

export function shouldSkipPosCatalogueRefresh(input: {
  checkoutInFlight: boolean;
  demoMode: boolean;
  online: boolean;
}) {
  return input.demoMode || !input.online || input.checkoutInFlight;
}

export function isPosCatalogueStorageEvent(event: { key: string | null }) {
  return event.key === POS_CATALOGUE_INVALIDATION_KEY;
}

export function applyPosCatalogueRefresh<TCart, TProduct>(input: {
  cart: TCart;
  nextProducts: TProduct[];
}) {
  return {
    cart: input.cart,
    products: input.nextProducts,
  };
}

export function signalPosCatalogueInvalidation() {
  if (typeof window === "undefined") return;
  const stamp = String(Date.now());
  try {
    window.localStorage.setItem(POS_CATALOGUE_INVALIDATION_KEY, stamp);
  } catch {
    // Private mode or blocked storage still allows BroadcastChannel below.
  }
  try {
    const channel = new BroadcastChannel(POS_CATALOGUE_CHANNEL);
    channel.postMessage({ at: stamp, type: "invalidate" });
    channel.close();
  } catch {
    // BroadcastChannel is optional acceleration for same-browser tabs.
  }
}
