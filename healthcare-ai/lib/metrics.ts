// Request metrics (Production Engineering — Observability + Security & Costs —
// cost optimization). Every AI-calling route reports duration/status/token
// usage to a Back4App "RequestLog" class via withMetrics() below, which
// scripts/setup-indexes.ts and app/api/admin/metrics/route.ts then read back to
// compute p95 latency, error rate, and token spend — the numbers the
// performance targets in plan.md are measured against.
//
// This is server-side, so it uses "parse/node" directly rather than
// lib/parse-client.ts's initializeParse(), which deliberately no-ops when
// `window` is undefined (that module is client-only by design).
//
// Known limitation, stated plainly: RequestLog has no ACL restricting reads —
// Back4App's default class-level permissions apply. It holds no personal data
// (route names, durations, status, token counts only), which is why that's an
// acceptable starting point, but a real production deployment should restrict
// `find`/`get` on this class to a master-key-only or admin-role context via
// the Back4App dashboard. Not done here — see docs/security-audit.md.
import Parse from "parse/node";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

let initialized = false;
function initServerParse(): boolean {
  if (initialized) return true;
  const appId = process.env.NEXT_PUBLIC_BACK4APP_APP_ID;
  const jsKey = process.env.NEXT_PUBLIC_BACK4APP_JS_KEY;
  if (!appId || !jsKey) return false;
  Parse.initialize(appId, jsKey);
  (Parse as unknown as { serverURL: string }).serverURL = "https://parseapi.back4app.com";
  initialized = true;
  return true;
}

export interface RequestLogFields {
  route: string;
  durationMs: number;
  status: "success" | "error" | "rate_limited";
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

// Fire-and-forget: a metrics-logging failure must never fail or slow down the
// actual user-facing request.
export function recordRequest(fields: RequestLogFields): void {
  logger.info("request", { ...fields });

  if (!initServerParse()) return;
  const RequestLog = Parse.Object.extend("RequestLog");
  const entry = new RequestLog();
  entry.set("route", fields.route);
  entry.set("durationMs", fields.durationMs);
  entry.set("status", fields.status);
  if (fields.model) entry.set("model", fields.model);
  if (fields.promptTokens !== undefined) entry.set("promptTokens", fields.promptTokens);
  if (fields.completionTokens !== undefined) entry.set("completionTokens", fields.completionTokens);
  if (fields.errorMessage) entry.set("errorMessage", fields.errorMessage.slice(0, 500));

  entry.save().catch((err: Error) => {
    logger.warn("failed to persist RequestLog", { error: err.message });
  });
}

// Wraps a route handler with timing + success/error metrics recording.
// Usage: export const POST = withMetrics("chat", async (request) => {...});
export function withMetrics<Req extends Request = NextRequest>(
  route: string,
  handler: (request: Req) => Promise<Response>
): (request: Req) => Promise<Response> {
  return async (request: Req) => {
    const start = Date.now();
    try {
      const response = await handler(request);
      recordRequest({
        route,
        durationMs: Date.now() - start,
        status: response.status === 429 ? "rate_limited" : response.ok ? "success" : "error",
      });
      return response;
    } catch (err) {
      recordRequest({
        route,
        durationMs: Date.now() - start,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

// Daily Groq token-budget threshold check (Security & Costs — budget alerts).
// Groq's free/on-demand tier caps at 100,000 tokens/day — this was hit for
// real during this build phase (see plan.md's feasibility notes). No
// email/Slack notification service is integrated, so "alert" here means a
// structured warning log, which any log-based alerting (e.g. a Netlify log
// drain rule, or the observability service noted in plan.md as the paid
// upgrade path) could trigger on.
// In-memory, per-warm-instance only — same limitation as lib/rate-limit.ts,
// documented there in full. This catches sustained usage within one instance's
// lifetime; it is not a source of truth across concurrent instances. The
// RequestLog data recorded above is the source of truth for real usage
// analysis (app/api/admin/metrics computes actual totals from it).
const DAILY_TOKEN_BUDGET = Number(process.env.DAILY_TOKEN_BUDGET ?? 90_000);
let dailyTokensUsed = 0;
let budgetWindowStart = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

export function recordTokenUsage(promptTokens: number, completionTokens: number): void {
  if (Date.now() - budgetWindowStart > DAY_MS) {
    dailyTokensUsed = 0;
    budgetWindowStart = Date.now();
  }
  dailyTokensUsed += promptTokens + completionTokens;
  if (dailyTokensUsed > DAILY_TOKEN_BUDGET) {
    logger.warn("approaching or exceeding daily Groq token budget", {
      dailyTokensUsed,
      budget: DAILY_TOKEN_BUDGET,
    });
  }
}
