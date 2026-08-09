import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  outputFileTracingIncludes: {
    // data/corpus.json (the BM25 keyword index, and the exposure route's county
    // lookup) is read via a runtime-built fs path, which Next's file tracer
    // can't see statically, so it has to be force-included.
    "/api/chat": ["./data/corpus.json"],
    "/api/exposure": ["./data/corpus.json"],
  },
};

export default nextConfig;
