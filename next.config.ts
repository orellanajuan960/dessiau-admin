import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-896f3880-631a-4805-94c3-6d65bfe77bfc.space-z.ai",
    ".space-z.ai",
  ],
  serverExternalPackages: ["bcryptjs"],
  env: {
    DATABASE_URL: process.env.DATABASE_URL?.startsWith("postgresql")
      ? process.env.DATABASE_URL
      : "postgresql://neondb_owner:npg_7jqFN8BQUwKS@ep-purple-night-aj20yenk-pooler.c-3.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require",
  },
  turbopack: {
    resolveAlias: {
      "pdfkit/js/data": path.resolve(__dirname, "pdfkit-data"),
    },
  },
  async rewrites() {
    return [
      {
        source: "/bcv-proxy/:path*",
        destination: "https://www.bcv.org.ve/:path*",
      },
    ];
  },
};

export default nextConfig;
