"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Eye, Upload, AlertTriangle, Video, Circle, Square, RotateCcw } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import { useCameraRecorder, type CameraRecorderError } from "@/hooks/useCameraRecorder";

type SourceMode = "upload" | "record";

interface ScreeningResult {
  screening: Record<string, unknown>;
  movement: Record<string, unknown>;
  characterization: Record<string, unknown>;
  pupilDetection: Record<string, unknown>;
  reportHtml: string;
}

export default function VestibularScreeningPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [eye, setEye] = useState<"left" | "right">("right");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCameraError = (err: CameraRecorderError) => setError(err.message);
  const {
    state: cameraState,
    videoRef: cameraVideoRef,
    recordedFile,
    startPreview: startCameraPreview,
    startRecording: startCameraRecording,
    stopRecording: stopCameraRecording,
    cancel: cancelCamera,
  } = useCameraRecorder(handleCameraError);

  // Whichever source is active supplies the file to submit -- no separate
  // state to keep in sync, just a derived pick.
  const file = sourceMode === "record" ? recordedFile : uploadedFile;

  // The <video> element is wired to the live camera stream while
  // recording (via cameraVideoRef's srcObject, set inside the hook); once
  // stopped, that stream is closed, so swap the same element over to
  // playing the recorded blob back for review before submitting.
  useEffect(() => {
    if (sourceMode !== "record" || cameraState !== "idle" || !file || !cameraVideoRef.current) return;
    const url = URL.createObjectURL(file);
    const el = cameraVideoRef.current;
    el.srcObject = null;
    el.src = url;
    el.controls = true;
    return () => URL.revokeObjectURL(url);
  }, [sourceMode, cameraState, file, cameraVideoRef]);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("video", file);
      body.append("eye", eye);
      const res = await fetch("/api/vestibular-screening", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-semibold text-slate-900">ClearSignal</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/chat"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Nystagmus / vestibular screening</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Upload a short close-up or webcam-style video of one eye. This runs vestibular-ai&apos;s pupil-tracking and
          eye-movement pipeline and pattern-matches the result against literature-described nystagmus signatures
          (Stage 5 of 7). It is <strong>research-only, unimodal, and never a diagnosis</strong> — bring the result to
          a clinician rather than acting on it alone.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
          <div className="flex gap-2">
            {(
              [
                { id: "upload" as const, label: "Upload a video", icon: Upload },
                { id: "record" as const, label: "Record from camera", icon: Video },
              ]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  cancelCamera();
                  setUploadedFile(null);
                  setSourceMode(id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  sourceMode === id
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-teal-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {sourceMode === "upload" ? (
            <div>
              <label htmlFor="video" className="block text-sm font-medium text-slate-700 mb-1">
                Eye-tracking video (MP4, WebM, or MOV, under 100MB)
              </label>
              <input
                ref={fileInputRef}
                id="video"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:text-sm file:font-medium hover:file:bg-teal-100"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Record a close-up clip (up to 30 seconds)
              </label>
              <div className="rounded-lg overflow-hidden bg-slate-900 aspect-video relative">
                <video
                  ref={cameraVideoRef}
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${cameraState === "idle" && !file ? "opacity-0" : ""}`}
                />
                {cameraState === "recording" && (
                  <span className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full">
                    <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />
                    Recording
                  </span>
                )}
                {cameraState === "idle" && !file && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                    Camera preview appears here
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                {cameraState === "idle" && !file && (
                  <button
                    type="button"
                    onClick={startCameraPreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Video className="w-4 h-4" />
                    Start camera
                  </button>
                )}
                {cameraState === "previewing" && (
                  <button
                    type="button"
                    onClick={startCameraRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Circle className="w-3.5 h-3.5 fill-white" />
                    Start recording
                  </button>
                )}
                {cameraState === "recording" && (
                  <button
                    type="button"
                    onClick={stopCameraRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-900 text-white"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    Stop
                  </button>
                )}
                {cameraState === "idle" && file && (
                  <button
                    type="button"
                    onClick={cancelCamera}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Record again
                  </button>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Which eye is in frame?</label>
            <div className="flex gap-2">
              {(["right", "left"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEye(option)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    eye === option
                      ? "bg-teal-600 border-teal-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-teal-300"
                  }`}
                >
                  {option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !file}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? "Processing (this can take a minute)…" : "Run screening"}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Explainable report</p>
            <iframe
              srcDoc={result.reportHtml}
              title="Vestibular screening report"
              sandbox=""
              className="w-full rounded-lg border border-slate-100"
              style={{ height: "70vh" }}
            />
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          ⚕️ Descriptive pattern-matching against published eye-movement signatures, not a diagnosis. Validated only
          against synthetic ground truth so far — see vestibular-ai/README.md for current limitations.
        </p>
      </div>
    </div>
  );
}
