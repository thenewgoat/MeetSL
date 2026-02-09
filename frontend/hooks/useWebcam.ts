"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseWebcamOptions {
  fps?: number;
  maxWidth?: number;
  jpegQuality?: number;
  enabled: boolean;
  onFrame: (jpgBase64: string, ts: number) => void;
}

export type WebcamError = "not-allowed" | "not-found" | "unknown" | null;

export function useWebcam({
  fps = 10,
  maxWidth = 640,
  jpegQuality = 0.7,
  enabled,
  onFrame,
}: UseWebcamOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<WebcamError>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setError(null);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") setError("not-allowed");
        else if (err.name === "NotFoundError") setError("not-found");
        else setError("unknown");
      } else {
        setError("unknown");
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start/stop stream based on enabled
  useEffect(() => {
    if (enabled) {
      startStream();
    } else {
      stopStream();
    }
    return stopStream;
  }, [enabled, startStream, stopStream]);

  // Capture loop
  useEffect(() => {
    if (!enabled) return;

    // Create offscreen canvas once
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      // Downscale
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
      // Strip the data:image/jpeg;base64, prefix
      const base64 = dataUrl.split(",")[1];
      if (base64) {
        onFrameRef.current(base64, Date.now());
      }
    }, 1000 / fps);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fps, maxWidth, jpegQuality]);

  return { videoRef, error };
}
