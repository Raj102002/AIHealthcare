import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk", "@xenova/transformers"],
  outputFileTracingIncludes: {
    "/api/rag-chat": ["./data/**", "./models/**"],
  },
  outputFileTracingExcludes: {
    // sharp is @xenova/transformers' optional dependency for image inputs (vision
    // models) — we only ever run text feature-extraction, so it's dead weight here.
    // Verified the pipeline loads and runs fine with sharp absent entirely.
    "/api/rag-chat": ["./node_modules/@xenova/transformers/node_modules/sharp/**"],
  },
};

export default nextConfig;
