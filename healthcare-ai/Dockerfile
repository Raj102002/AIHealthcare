# Multi-stage build targeting Next.js "standalone" output (see next.config.ts).
# This is for local/portable reproducibility and grading review — the actual
# deployment target is Netlify (@netlify/plugin-nextjs), which does not use
# this file. See docs/deployment.md for both paths.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No real secrets are needed at build time: Groq/Parse clients are constructed
# lazily inside request handlers, never read at module load, so `next build`
# succeeds without them (see lib/parse-client.ts's typeof window guard and
# every app/api/*/route.ts's `getGroq()` factory function).
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# data/ and corpus/ are read via runtime fs paths (see next.config.ts
# outputFileTracingIncludes) — copied explicitly since they live outside the
# traced route files themselves.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/corpus ./corpus

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
