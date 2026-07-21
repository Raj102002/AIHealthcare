import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk", "@xenova/transformers"],
  outputFileTracingIncludes: {
    // onnxruntime-node's native addon dlopen()s libonnxruntime.so.*.so at runtime
    // (not a JS require()), which Next's file tracer can't see statically, so it
    // has to be force-included or Netlify's Linux function throws ERR_DLOPEN_FAILED.
    "/api/rag-chat": [
      "./data/**",
      "./models/**",
      "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
    ],
  },
  outputFileTracingExcludes: {
    // sharp is @xenova/transformers' optional dependency for image inputs (vision
    // models) — we only ever run text feature-extraction, so it's dead weight here.
    // Verified the pipeline loads and runs fine with sharp absent entirely.
    "/api/rag-chat": ["./node_modules/@xenova/transformers/node_modules/sharp/**"],
  },
};

export default nextConfig;
