import path from "node:path";
import type { NextConfig } from "next";

// There's an unrelated package-lock.json several directories up (in the parent
// Downloads folder, outside this project entirely), which makes Next.js
// misdetect the monorepo root and nest standalone output several directories
// deep (.next/standalone/Anotherday/week2-Raj102002/healthcare-ai/server.js
// instead of .next/standalone/server.js) — silently breaking the Dockerfile's
// COPY paths. Pinning the root explicitly fixes it; verified by checking
// server.js lands at the top level of .next/standalone after this change.
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  // Standalone output is what makes the Docker image self-contained (Dockerfile
  // copies .next/standalone rather than needing a full node_modules install in
  // the runtime image). Doesn't change anything about the Netlify deploy path,
  // which ignores this and uses @netlify/plugin-nextjs instead.
  output: "standalone",
  outputFileTracingIncludes: {
    // data/corpus.json (the BM25 keyword index, and the exposure route's county
    // lookup) is read via a runtime-built fs path, which Next's file tracer
    // can't see statically, so it has to be force-included.
    "/api/chat": ["./data/corpus.json"],
    "/api/exposure": ["./data/corpus.json"],
    // vestibular-ai/run_screening.py is invoked as an external subprocess
    // (child_process.execFile), which Next's tracer has no way to follow --
    // without this the Python source and trained model files would be left
    // out of the Docker standalone bundle. Irrelevant on Netlify (no Python
    // runtime there regardless; see the route's own comment).
    "/api/vestibular-screening": ["./vestibular-ai/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            // 'unsafe-inline' on script-src is required because Next.js injects
            // its own hydration bootstrap (__NEXT_DATA__) as an inline <script>;
            // removing it needs per-request nonces via middleware, which is a
            // real follow-up hardening step (documented in docs/security-audit.md),
            // not done here. style-src needs it for the handoff document's
            // inline print stylesheet (app/handoff/page.tsx). No 'unsafe-eval'.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob:",
              "connect-src 'self' https://*.back4app.com https://*.upstash.io https://api.groq.com https://npiregistry.cms.hhs.gov https://clinicaltrials.gov",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
