import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { logger } from "@/lib/logger";

// Runs vestibular-ai's Stage 1-6 pipeline (pupil detection through the
// explainable HTML report) over one uploaded eye-tracking video, via
// vestibular-ai/run_screening.py. Unlike every other analysis route in this
// app, the actual "model" here is a local Python/OpenCV/PyTorch pipeline, not
// a Groq call -- there's nothing to invoke over HTTP, so this shells out to a
// subprocess instead. That only works where a Python interpreter with
// vestibular-ai/requirements.txt installed is reachable (a dev machine, or a
// container built to include it); the deployed Netlify path has no Python
// runtime at all, so this degrades the same way rash-analysis does when
// GROQ_VISION_MODEL is unset -- a 501 with an explanatory message, not a
// crash. See vestibular-ai/README.md for what Stage 5's screening does and,
// just as importantly, does not claim (descriptive pattern-matching against
// literature-described eye-movement signatures, never a diagnosis).
export const runtime = "nodejs";

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 30 * 60 * 1000;

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB -- these are short close-up/webcam clips, not feature-length video
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000;

const VESTIBULAR_AI_DIR = path.join(process.cwd(), "vestibular-ai");
const RUN_SCRIPT = path.join(VESTIBULAR_AI_DIR, "run_screening.py");

interface PipelineOutput {
  pupil_detection: Record<string, unknown>;
  trajectory_features: Record<string, unknown>;
  movement_classification: Record<string, unknown>;
  nystagmus_characterization: Record<string, unknown>;
  screening: Record<string, unknown>;
  report_path: string;
}

function runPipeline(pythonBin: string, videoPath: string, outputDir: string, eye: "left" | "right"): Promise<PipelineOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      pythonBin,
      [RUN_SCRIPT, "--video", videoPath, "--output-dir", outputDir, "--eye", eye],
      { cwd: VESTIBULAR_AI_DIR, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as PipelineOutput);
        } catch {
          reject(new Error(`Pipeline produced non-JSON output: ${stdout.slice(0, 500)}`));
        }
      }
    );
  });
}

// Tried in order; the first one that doesn't fail with ENOENT is used for
// every request afterward within this warm instance. Mirrors how cli.py's
// own --pupil-cnn-path opt-in falls back silently rather than hard-failing.
const PYTHON_CANDIDATES = [process.env.VESTIBULAR_PYTHON, "python3", "python"].filter(
  (v): v is string => !!v
);
let resolvedPython: string | null = null;

async function resolvePythonBin(): Promise<string | null> {
  if (resolvedPython) return resolvedPython;
  for (const candidate of PYTHON_CANDIDATES) {
    const works = await new Promise<boolean>((resolve) => {
      execFile(candidate, ["--version"], { timeout: 10_000 }, (error) => resolve(!error));
    });
    if (works) {
      resolvedPython = candidate;
      return candidate;
    }
  }
  return null;
}

export const POST = withMetrics("vestibular-screening", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `vestibular-screening:${clientKeyFrom(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const pythonBin = await resolvePythonBin();
  if (!pythonBin) {
    return NextResponse.json(
      {
        error:
          "Vestibular screening isn't available in this environment yet — it needs a local Python install with vestibular-ai/requirements.txt. See vestibular-ai/README.md.",
      },
      { status: 501 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a video file." }, { status: 400 });
  }

  const video = formData.get("video");
  const eyeField = formData.get("eye");
  const eye = eyeField === "left" ? "left" : "right";

  if (!(video instanceof File)) {
    return NextResponse.json({ error: "Missing 'video' file field." }, { status: 400 });
  }
  if (video.size === 0 || video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: `Video must be under ${MAX_VIDEO_BYTES / (1024 * 1024)}MB.` }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(video.type)) {
    return NextResponse.json({ error: "Unsupported video type. Use MP4, WebM, or MOV." }, { status: 400 });
  }

  // Extension is picked from a fixed allowlist keyed on the validated MIME
  // type above, never derived from the client-supplied filename directly --
  // `video.name` is attacker-controlled and could otherwise smuggle path
  // separators through path.extname() (e.g. "a.mp4/../../x") into a path
  // that then escapes workDir when joined.
  const EXT_BY_TYPE: Record<string, string> = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
  const workDir = await mkdtemp(path.join(tmpdir(), "vestibular-"));
  const outputDir = path.join(workDir, "outputs");
  const videoPath = path.join(workDir, `input${EXT_BY_TYPE[video.type] ?? ".mp4"}`);

  try {
    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));

    const result = await runPipeline(pythonBin, videoPath, outputDir, eye);
    const reportHtml = await readFile(result.report_path, "utf-8");

    return NextResponse.json({
      screening: result.screening,
      movement: result.movement_classification,
      characterization: result.nystagmus_characterization,
      pupilDetection: result.pupil_detection,
      reportHtml,
    });
  } catch (error: unknown) {
    const stderr = (error as { stderr?: string } | undefined)?.stderr;
    logger.warn("vestibular-screening pipeline failed", {
      error: error instanceof Error ? error.message : String(error),
      stderr: stderr?.slice(0, 2000),
    });
    const message =
      (error as { code?: string } | undefined)?.code === "ETIMEDOUT"
        ? "Screening took too long and was stopped. Try a shorter clip."
        : "Couldn't process this video for screening. Make sure it's a clear close-up or face recording of the eye(s).";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
