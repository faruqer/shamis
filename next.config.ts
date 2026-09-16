import type { NextConfig } from "next";

// Sale dates, "today" and report days are computed on the server in local time.
// Pin it to Ethiopia so a server running on UTC doesn't shift late-night sales to another day.
process.env.TZ = process.env.TZ || "Africa/Addis_Ababa";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /\/api\/.*/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
    },
  ],
});

// The server runs `next start` under PM2, so no standalone build (that was for the old Docker setup).
const nextConfig: NextConfig = {};

export default withPWA(nextConfig);
