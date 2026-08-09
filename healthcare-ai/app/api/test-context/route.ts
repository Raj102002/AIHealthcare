import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { buildContext } from "@/lib/generation";
import { computeTestTiming, shouldSuggestRetest } from "@/lib/test-timing";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { testContextRequestSchema, formatZodError } from "@/lib/validation";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function formatDays(n: number): string {
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;
}

// The narrative here is built from a fixed template + retrieved facts, never
// generated freehand — the date arithmetic and the "should you retest" logic
// must be exact every time, not phrased differently by an LLM each call.
export const POST = withMetrics("test-context", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`test-context:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = testContextRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { symptomOnsetDate, testDate } = parsed.data;
    const onset = new Date(symptomOnsetDate);
    const test = new Date(testDate);
    if (Number.isNaN(onset.getTime()) || Number.isNaN(test.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const { daysFromOnset, window } = computeTestTiming(onset, test);

    const groq = getGroq();
    const retrieved = await retrieve(
      "Lyme disease antibody response timing IgM test sensitivity early infection retesting guidance",
      groq
    );
    const { block, sources } = buildContext(retrieved);

    if (block.length === 0) {
      return NextResponse.json({
        daysFromOnset,
        window,
        message:
          "The knowledge base doesn't have specific antibody-timing guidance available right now. Ask your clinician directly whether your test timing was adequate given when your symptoms began.",
        sources: [],
        contextAvailable: false,
      });
    }

    const timingSource = sources.find((s) => s.section_path.includes("Antibody Response Timing"));
    const retestSource = sources.find((s) => s.section_path.includes("Retesting Guidance"));

    const lines: string[] = [];

    if (daysFromOnset < 0) {
      lines.push(
        `The test date you entered is before the symptom start date you entered — double check both dates before reading further.`
      );
    } else {
      lines.push(`Your test was drawn ${formatDays(daysFromOnset)} after your symptoms began.`);
    }

    if (timingSource) {
      lines.push(
        `CDC states the IgM antibody response peaks 3-6 weeks after infection and may not be detected in the first two weeks. [${timingSource.number}]`
      );
    }

    if (shouldSuggestRetest(window)) {
      if (retestSource) {
        lines.push(
          `Because this test was taken before that window, CDC recommends repeat testing 2-4 weeks later, when the first test was taken before an adequate antibody response could develop. [${retestSource.number}]`
        );
      }
      lines.push(`Question to ask your clinician: should this test be repeated?`);
    } else if (window === "within_reliable_window") {
      lines.push(
        `This falls within the window where the antibody response has typically had time to develop, though individual timing varies — a negative result still isn't the same as ruling Lyme disease out on its own.`
      );
    }

    lines.push("This is not a diagnosis. It is a sourced fact about test timing, not an interpretation of your result.");

    return NextResponse.json({
      daysFromOnset,
      window,
      message: lines.join("\n\n"),
      sources,
      contextAvailable: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
