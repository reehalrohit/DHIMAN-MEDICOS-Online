const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",   // FIX: previously built but never wired in
  },
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "dhiman-medicos-cache",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,

  // Faster builds — skip type checking in CI
  typescript: { ignoreBuildErrors: false },

  // Optimise fonts
  optimizeFonts: true,

  // Headers for performance & security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Cache static assets for 1 year
        source: "/(.*)\\.(ico|png|svg|jpg|jpeg|webp|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
});
