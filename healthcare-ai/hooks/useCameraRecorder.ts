"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraRecorderState = "idle" | "previewing" | "recording";

export type CameraRecorderErrorType = "permission-denied" | "no-camera" | "unsupported" | "unknown";

export interface CameraRecorderError {
  type: CameraRecorderErrorType;
  message: string;
}

const ERROR_MESSAGES: Record<CameraRecorderErrorType, string> = {
  "permission-denied": "Camera access was denied. Allow camera access in your browser settings to record a clip.",
  "no-camera": "No camera was found on this device.",
  unsupported: "This browser doesn't support in-page video recording. Upload a video file instead.",
  unknown: "Something went wrong starting the camera. Please try again.",
};

function buildError(type: CameraRecorderErrorType): CameraRecorderError {
  return { type, message: ERROR_MESSAGES[type] };
}

// Bounds how long a live-recorded clip can run -- these are close-up eye
// clips for pattern-matching, not general video, and a hard cap keeps
// uploads small without needing the user to watch a clock.
const HARD_CAP_MS = 30_000;

// Mirrors hooks/useVoiceInput.ts's getUserMedia/MediaRecorder error-mapping
// and teardown pattern, video instead of audio: preview a live stream first
// (so the person can frame their eye), then record on demand.
export function useCameraRecorder(onError: (error: CameraRecorderError) => void) {
  const [state, setState] = useState<CameraRecorderState>("idle");
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const hardCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startPreview = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError(buildError("unsupported"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") onError(buildError("permission-denied"));
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") onError(buildError("no-camera"));
      else onError(buildError("unknown"));
      return;
    }
    streamRef.current = stream;
    setRecordedFile(null);
    setState("previewing");
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
  }, [onError]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      onError(buildError("unsupported"));
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      setRecordedFile(new File([blob], "recording.webm", { type }));
      stopStream();
      setState("idle");
      if (hardCapRef.current !== null) {
        clearTimeout(hardCapRef.current);
        hardCapRef.current = null;
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setState("recording");
    hardCapRef.current = setTimeout(() => recorder.stop(), HARD_CAP_MS);
  }, [onError, stopStream]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    stopRecording();
    stopStream();
    setState("idle");
    setRecordedFile(null);
  }, [stopRecording, stopStream]);

  useEffect(() => {
    return () => {
      if (hardCapRef.current !== null) clearTimeout(hardCapRef.current);
      stopStream();
    };
  }, [stopStream]);

  return { state, videoRef, recordedFile, startPreview, startRecording, stopRecording, cancel };
}
