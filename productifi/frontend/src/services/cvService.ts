/**
 * cvService.ts
 *
 * Handles TWO things:
 *
 *  A) FACE DETECTION (TF.js / MediaPipe, 300 ms)
 *     Gives live facePresent + position-based attention score.
 *     Gemini Vision overrides this every 8 s with a smarter score.
 *
 *  B) AUDIO AMPLITUDE DETECTION (Web Audio API, 150 ms)
 *     Works even when the Productifi tab is in the background.
 *     Uses wall-clock time so throttled background timers don't break the 3s window.
 *     Fires onSustainedTalking() after 3 continuous seconds above threshold.
 *
 * Why amplitude instead of SpeechRecognition for the notification trigger:
 *   Chrome PAUSES SpeechRecognition as soon as the tab is not visible.
 *   The AudioContext + setInterval approach continues (at ≥1 Hz) even in background.
 */

import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';

const FACE_DETECT_INTERVAL_MS  = 300;
const AUDIO_SAMPLE_INTERVAL_MS = 150;
// Average amplitude (0–255) above which we consider the mic "loud"
const TALK_AMPLITUDE_THRESHOLD = 14;
// Milliseconds of sustained loud audio before firing onSustainedTalking
const SUSTAINED_TALKING_MS     = 3_000;

export interface CVMetrics {
  facePresent:   boolean;
  eyeAttention:  number;   // 0–100
  drowsinessFlag: boolean;
  typingActive:  boolean;  // true = sustained talking detected via amplitude
}

export interface CVAlert {
  msg: string;
  ts:  number; // Date.now() when created
}

export function useCVService(
  isActive: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  onSustainedTalking?: () => void,
) {
  const [cvMetrics, setCvMetrics] = useState<CVMetrics>({
    facePresent:   false,
    eyeAttention:  0,
    drowsinessFlag: false,
    typingActive:  false,
  });
  const [alerts, setAlerts]           = useState<CVAlert[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const detectorRef       = useRef<faceDetection.FaceDetector | null>(null);
  const prevFaceRef       = useRef<boolean | null>(null);
  // Stable ref so the effect doesn't re-run when the callback identity changes
  const callbackRef       = useRef(onSustainedTalking);
  useEffect(() => { callbackRef.current = onSustainedTalking; }, [onSustainedTalking]);

  useEffect(() => {
    if (!isActive) return;

    let stream:       MediaStream | null    = null;
    let audioCtx:     AudioContext | null   = null;
    let analyser:     AnalyserNode | null   = null;
    let faceInterval: ReturnType<typeof setInterval>;
    let audioInterval: ReturnType<typeof setInterval>;
    let isComponentMounted = true;

    // Wall-clock start of the current "loud" window (null = currently quiet)
    let talkStartMs: number | null = null;

    // Keep AudioContext alive when the tab goes to the background
    const handleVisibility = () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const start = async () => {
      try {
        // ── Load TF.js detector (cached) ────────────────────────────────────
        if (!detectorRef.current) {
          const detector = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            { runtime: 'tfjs', maxFaces: 2 },
          );
          detectorRef.current = detector;
        }

        // ── Camera + Microphone in a single permission prompt ───────────────
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,  // needed for amplitude detection in background
        });

        if (!isComponentMounted) { stream.getTracks().forEach(t => t.stop()); return; }

        // ── Attach stream to <video> and EXPLICITLY play ────────────────────
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // autoPlay attribute alone is unreliable after programmatic srcObject assignment
          try { await video.play(); } catch { /* already playing or policy block */ }
          // Wait until the first frame is available
          await new Promise<void>(resolve => {
            if (!video || video.readyState >= 2) { resolve(); return; }
            const onReady = () => { video.removeEventListener('canplay', onReady); resolve(); };
            video.addEventListener('canplay', onReady);
          });
        }

        // ── Audio pipeline ───────────────────────────────────────────────────
        audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const micSource = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        micSource.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);

        audioInterval = setInterval(() => {
          if (!isComponentMounted || !analyser) return;

          // Resume if throttled by the browser (common in background tabs)
          if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

          analyser.getByteFrequencyData(freqData);
          const avg = freqData.reduce((s, v) => s + v, 0) / freqData.length;
          const isLoud = avg > TALK_AMPLITUDE_THRESHOLD;

          if (isLoud) {
            if (talkStartMs === null) {
              talkStartMs = Date.now();       // start wall-clock window
            }
            const elapsed = Date.now() - talkStartMs;

            // Update UI immediately
            setCvMetrics(prev => prev.typingActive ? prev : { ...prev, typingActive: true });

            if (elapsed >= SUSTAINED_TALKING_MS) {
              // Fire callback and reset so it can fire again after another 3 s
              callbackRef.current?.();
              talkStartMs = Date.now();
            }
          } else {
            talkStartMs = null;
            setCvMetrics(prev => prev.typingActive ? { ...prev, typingActive: false } : prev);
          }
        }, AUDIO_SAMPLE_INTERVAL_MS);

        setIsModelLoaded(true);

        // ── Face detection loop ──────────────────────────────────────────────
        faceInterval = setInterval(async () => {
          if (!isComponentMounted || !detectorRef.current || !videoRef.current) return;
          const v = videoRef.current;
          // Guard: need frames to be available and video playing
          if (v.readyState < 2 || v.videoWidth === 0) return;

          try {
            const faces = await detectorRef.current.estimateFaces(v);
            const vw = v.videoWidth;
            const vh = v.videoHeight;
            const facePresent = faces.length > 0;
            let attention = 0;

            if (facePresent) {
              const face = faces.reduce((best, f) =>
                f.box.width * f.box.height > best.box.width * best.box.height ? f : best,
              );
              const { box } = face;
              const cx = box.xMin + box.width  / 2;
              const cy = box.yMin + box.height / 2;
              const hOff = Math.abs(cx - vw / 2) / (vw / 2);
              const vOff = Math.abs(cy - vh / 2) / (vh / 2);
              const posScore  = Math.max(0, 100 - hOff * 60 - vOff * 15);
              const areaRatio = (box.width * box.height) / (vw * vh);
              const sizeScore = areaRatio > 0.03 ? 100 : areaRatio > 0.008 ? 75 : 45;
              // Enhanced scoring: consider eye openness if available
              let eyeScore = 50; // default
              if (face.keypoints) {
                const leftEye = face.keypoints.find(k => k.name === 'leftEye');
                const rightEye = face.keypoints.find(k => k.name === 'rightEye');
                if (leftEye && rightEye) {
                  // Simple eye openness heuristic
                  const eyeDist = Math.abs(leftEye.y - rightEye.y);
                  eyeScore = eyeDist > 0.02 ? 100 : eyeDist > 0.01 ? 75 : 25;
                }
              }
              attention = Math.round(Math.max(15, Math.min(100, posScore * 0.5 + sizeScore * 0.3 + eyeScore * 0.2)));
            }

            if (isComponentMounted) {
              const now = Date.now();
              if (prevFaceRef.current === true  && !facePresent)
                setAlerts(p => [{ msg: 'Face not detected — are you still there?', ts: now }, ...p].slice(0, 8));
              else if (prevFaceRef.current === false && facePresent)
                setAlerts(p => [{ msg: 'Face detected — tracking resumed', ts: now }, ...p].slice(0, 8));
              prevFaceRef.current = facePresent;

              setCvMetrics(prev => ({
                ...prev,
                facePresent,
                eyeAttention: attention,
                drowsinessFlag: false,
              }));
            }
          } catch { /* keep previous state on detection error */ }
        }, FACE_DETECT_INTERVAL_MS);

      } catch (err) {
        // Camera/mic denied — fall back to mock so the session still works
        console.warn('[CV] Camera/mic unavailable, using mock metrics:', err);
        if (!isComponentMounted) return;
        setIsModelLoaded(true);
        setCvMetrics({ facePresent: true, eyeAttention: 80, drowsinessFlag: false, typingActive: false });
      }
    };

    start();

    return () => {
      isComponentMounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(faceInterval);
      clearInterval(audioInterval);
      if (stream)   stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
    };
  }, [isActive, videoRef]);

  /** Sync talking state from an external source (e.g. speechService) */
  const setTalkingActive = (active: boolean) =>
    setCvMetrics(prev => prev.typingActive === active ? prev : { ...prev, typingActive: active });

  return { cvMetrics, alerts, isModelLoaded, setTalkingActive };
}
