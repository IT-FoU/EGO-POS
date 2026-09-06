import type { MetadataRoute } from "next";

/**
 * PWA manifest for the EGO POS Mini Mart store app (Offline-first Phase 2).
 * Served by Next at `/manifest.webmanifest`. SVG icons are provided now; raster
 * PNG icons (192/512, maskable) are a WAITING design-asset item.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EGO POS",
    short_name: "EGO POS",
    description: "EGO POS Mini Mart — point of sale and store management.",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b1220",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
