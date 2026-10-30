import type { NextConfig } from "next";

// Generate a unique build ID based on current timestamp — changes on every Vercel deploy
const BUILD_ID = new Date().toISOString();

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  async headers() {
    // El editor de reportes (/appreporte) se pide siempre con ?v=<versión>: si la versión no cambia,
    // el navegador lo guarda y abre al instante. Al cambiar la versión se descarga de nuevo.
    return [
      {
        source: "/appreporte/:file*",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/appreporte/:file(flatpickr.min.js|flatpickr.min.css|lp-logo.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default nextConfig;
