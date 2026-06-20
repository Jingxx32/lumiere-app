import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) resolves its worker file at runtime — bundling breaks it
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
