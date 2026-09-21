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

// The app is often reached over plain http on the local network, where a Strict-Transport-Security
// header would lock that out after the first https visit. Opt in with HSTS=true when served over TLS.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(process.env.HSTS === "true"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

// The server runs `next start` under PM2, so no standalone build (that was for the old Docker setup).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // LOW_MEMORY=true builds with a single worker — slower, but survives a 1 GB server.
  ...(process.env.LOW_MEMORY === "true" ? { experimental: { cpus: 1, workerThreads: false } } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
