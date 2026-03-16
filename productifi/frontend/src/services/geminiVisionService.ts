/**
 * geminiVisionService.ts
 *
 * Uses Gemini Vision (gemini-1.5-flash-8b) to analyse webcam snapshots every
 * ANALYSIS_INTERVAL_MS milliseconds and return:
 *  - attentionScore  0-100
 *  - facePresent     boolean
 *  - talkingDetected boolean (mouth open / moving)
 *  - feedback        short description of what Gemini sees
 *  - coachingMessage personalised nudge when score < COACHING_THRESHOLD
 *
 * If the API key is missing or a request fails, all values fall back to null
 * so the caller can use the fast TF.js scores instead.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CVAlert } from './cvService';

// How often to send a frame to Gemini (ms)
const ANALYSIS_INTERVAL_MS = 5_000;
// Score below which Gemini generates a coaching nudge
const COACHING_THRESHOLD = 60;
// Model — 8b is fast, cheap, and more than accurate enough for this task
const MODEL_NAME = 'gemini-1.5-flash-8b';

export interface GeminiAnalysis {
  attentionScore: number;
  facePresent: boolean;
  talkingDetected: boolean;
  lookingAway: boolean;
  distracted: boolean;
  feedback: string;
  coachingMessage: string;
}

const VISION_PROMPT = `You are a focus-monitoring AI embedded in a productivity app called Productifi.
Analyse this webcam snapshot from a live focus session.

Reply with ONLY a valid JSON object — no markdown fences, no extra text:
{
  "attentionScore": <integer 0-100>,
  "facePresent": <true|false>,
  "talkingDetected": <true|false — mouth open or clearly mid-speech>,
  "lookingAway": <true|false — eyes directed away from screen/camera>,
  "distracted": <true|false — any distraction: talking, phone, looking away, multitasking>,
  "feedback": "<≤12 words: describe exactly what you observe in present tense>",
  "coachingMessage": "<if attentionScore < 60, one direct actionable sentence to refocus; otherwise empty string>"
}

Scoring guide:
100 — face centred, eyes locked on screen, focused upright posture, fully engaged
 85 — face present, mostly on-screen, minor position drift, no distractions
 70 — face visible but position drifting, some eye wander or mild disengagement
 55 — slight talking, eyes wandering frequently, slouching, or mild distraction detected
 40 — clearly talking, looking away from screen, phone visible, or extended distraction
 25 — face barely visible, extended looking away, actively multitasking, very unfocused
 10 — no face visible, clearly doing something entirely unrelated
  0 — empty frame or camera blocked

Rules:
- Set lookingAway=true when eyes point away from screen or are clearly not on the content.
- Set talkingDetected=true only when the mouth is clearly open in mid-speech or the jaw is moving.
- Set distracted=true when any of: talkingDetected, lookingAway, phone in frame, or person not at desk.
- Keep feedback factual and brief (e.g. "eyes on screen, good posture" or "talking, looking to the side").
- coachingMessage must be warm, specific, and under 20 words.`;

/** Capture one JPEG frame from the <video> element as a base64 string. */
function captureFrame(video: HTMLVideoElement, quality = 0.65): string | null {
  if (!video || video.videoWidth === 0 || video.readyState < 2 || video.paused) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1]; // base64 only
}

/** Parse Gemini's JSON response defensively. */
function parseAnalysis(text: string): GeminiAnalysis | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const raw = JSON.parse(match[0]);
    return {
      attentionScore: Math.max(0, Math.min(100, Number(raw.attentionScore) || 0)),
      facePresent: Boolean(raw.facePresent),
      talkingDetected: Boolean(raw.talkingDetected),
      lookingAway: Boolean(raw.lookingAway),
      distracted: Boolean(raw.distracted),
      feedback: String(raw.feedback || '').trim(),
      coachingMessage: String(raw.coachingMessage || '').trim(),
    };
  } catch {
    return null;
  }
}

export function useGeminiVision(
  isActive: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [geminiAlerts, setGeminiAlerts] = useState<CVAlert[]>([]);
  const [isAvailable, setIsAvailable] = useState(false);

  const clientRef = useRef<GoogleGenerativeAI | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const runAnalysis = useCallback(async () => {
    if (inFlightRef.current) return; // skip if previous call still pending
    const video = videoRef.current;
    if (!video || !clientRef.current) return;

    const base64 = captureFrame(video);
    if (!base64) return;

    inFlightRef.current = true;
    try {
      const model = clientRef.current.getGenerativeModel({ model: MODEL_NAME });
      const result = await model.generateContent([
        { inlineData: { data: base64, mimeType: 'image/jpeg' } },
        VISION_PROMPT,
      ]);
      const text = result.response.text().trim();
      const parsed = parseAnalysis(text);
      if (!parsed) return;

      setAnalysis(parsed);
      setIsAvailable(true);

      // Generate event-log entries for notable changes
      const now = Date.now();
      if (!parsed.facePresent) {
        setGeminiAlerts(prev =>
          [{ msg: 'Gemini: No face detected — step back to your desk', ts: now }, ...prev].slice(0, 8),
        );
      } else if (parsed.talkingDetected) {
        setGeminiAlerts(prev =>
          [{ msg: `Gemini: Talking detected — ${parsed.feedback}`, ts: now }, ...prev].slice(0, 8),
        );
      } else if (parsed.lookingAway) {
        setGeminiAlerts(prev =>
          [{ msg: `Gemini: Eyes away from screen — ${parsed.feedback}`, ts: now }, ...prev].slice(0, 8),
        );
      } else if (parsed.distracted) {
        setGeminiAlerts(prev =>
          [{ msg: `Gemini: Distraction detected — ${parsed.feedback}`, ts: now }, ...prev].slice(0, 8),
        );
      } else if (parsed.attentionScore < COACHING_THRESHOLD && parsed.coachingMessage) {
        setGeminiAlerts(prev =>
          [{ msg: `Gemini: ${parsed.coachingMessage}`, ts: now }, ...prev].slice(0, 8),
        );
      } else if (parsed.attentionScore >= 85) {
        // Positive reinforcement every so often
        setGeminiAlerts(prev =>
          [{ msg: `Gemini: ✓ ${parsed.feedback}`, ts: now }, ...prev].slice(0, 8),
        );
      }
    } catch (e) {
      console.warn('[GeminiVision] Request failed:', e);
    } finally {
      inFlightRef.current = false;
    }
  }, [videoRef]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      console.warn('[GeminiVision] VITE_GEMINI_API_KEY not set — vision analysis disabled');
      return;
    }
    clientRef.current = new GoogleGenerativeAI(apiKey);

    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Run once immediately, then on interval
    runAnalysis();
    timerRef.current = setInterval(runAnalysis, ANALYSIS_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, runAnalysis]);

  return { analysis, geminiAlerts, isAvailable };
}
