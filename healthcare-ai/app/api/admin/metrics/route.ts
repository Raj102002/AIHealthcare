import { NextResponse } from "next/server";
import Parse from "parse/node";
import { withMetrics } from "@/lib/metrics";
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

interface RouteMetrics {
  route: string;
  count: number;
  errorRate: number;
  rateLimitedRate: number;
  p50Ms: number;
  p95Ms: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

// Reads back what lib/metrics.ts writes to the RequestLog class and computes
// the actual numbers plan.md's performance targets are measured against
// (p95 latency, error rate). This is the "make it measurable" half of the
// Production Engineering performance-targets requirement — it does not itself
// prove uptime > 99.5% or claim the targets are met, since that requires
// sustained observation over time, not a single query.
export const GET = withMetrics("admin-metrics", async () => {
  if (!initServerParse()) {
    return NextResponse.json({ error: "Back4App credentials not configured" }, { status: 500 });
  }

  try {
    const RequestLog = Parse.Object.extend("RequestLog");
    const query = new Parse.Query(RequestLog);
    query.descending("createdAt");
    query.limit(1000);
    const results = await query.find();

    const byRoute = new Map<string, { durations: number[]; errors: number; rateLimited: number; promptTokens: number; completionTokens: number }>();

    for (const r of results) {
      const route = r.get("route") as string;
      const duration = r.get("durationMs") as number;
      const status = r.get("status") as string;
      const promptTokens = (r.get("promptTokens") as number) ?? 0;
      const completionTokens = (r.get("completionTokens") as number) ?? 0;

      if (!byRoute.has(route)) byRoute.set(route, { durations: [], errors: 0, rateLimited: 0, promptTokens: 0, completionTokens: 0 });
      const bucket = byRoute.get(route);
      if (!bucket) continue;
      bucket.durations.push(duration);
      if (status === "error") bucket.errors++;
      if (status === "rate_limited") bucket.rateLimited++;
      bucket.promptTokens += promptTokens;
      bucket.completionTokens += completionTokens;
    }

    const routeMetrics: RouteMetrics[] = [...byRoute.entries()].map(([route, bucket]) => {
      const sorted = [...bucket.durations].sort((a, b) => a - b);
      return {
        route,
        count: bucket.durations.length,
        errorRate: bucket.durations.length ? bucket.errors / bucket.durations.length : 0,
        rateLimitedRate: bucket.durations.length ? bucket.rateLimited / bucket.durations.length : 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        totalPromptTokens: bucket.promptTokens,
        totalCompletionTokens: bucket.completionTokens,
      };
    });

    const totalRequests = results.length;
    const totalErrors = routeMetrics.reduce((s, r) => s + Math.round(r.errorRate * r.count), 0);
    const totalTokens = routeMetrics.reduce((s, r) => s + r.totalPromptTokens + r.totalCompletionTokens, 0);

    return NextResponse.json({
      sampledAt: new Date().toISOString(),
      sampleSize: totalRequests,
      note: "Computed from the most recent 1000 RequestLog entries. Not a substitute for sustained uptime monitoring over time.",
      overall: {
        totalRequests,
        overallErrorRate: totalRequests ? totalErrors / totalRequests : 0,
        totalTokensUsed: totalTokens,
      },
      byRoute: routeMetrics.sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    logger.error("admin metrics query failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to compute metrics" }, { status: 500 });
  }
});
