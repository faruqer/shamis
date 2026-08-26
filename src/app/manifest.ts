import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Stock & Money | Inventory Management",
    short_name: "Stock & Money",
    description:
      "Professional stock and money management system for imports, wholesale, and retail",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#dce5df",
    theme_color: "#2f7d62",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
