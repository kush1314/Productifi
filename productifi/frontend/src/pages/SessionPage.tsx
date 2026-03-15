/**
 * SessionPage — Productifi focus session.
 * - Attention score: blended TF.js + Gemini with smoothing and recoverability
 * - Microphone: Web Audio API RMS — sustained 2s speaking → "Stay Focused!" notification
 * - Gemini coaching: live nudges when attention < 55
 * - Notifications: centralized service with cooldown + optional sound fallback
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { useGeminiVision } from '../services/geminiVisionService';
import {
  requestNotificationPermission,
  sendNoFaceNotification,
  sendTalkingNotification,
  resetNotificationCooldown,
} from '../services/notificationService';
import { Sparkles } from 'lucide-react';

const AUDIO_THRESHOLD = 15;
const SUSTAINED_TALK_MS = 2000;
const NOTIF_COOLDOWN_MS = 12000;
const FACE_INTERVAL_MS = 300;
const AUDIO_INTERVAL_MS = 80;
const LOOK_AWAY_TRIGGER_MS = 2000;
const BACKEND_POLL_INTERVAL_MS = 1200;
const BACKEND_STATUS_URL = 'http://127.0.0.1:5000/status';

const SCORE_CONVERSATION_PENALTY = 10;
const SCORE_LOOK_AWAY_PENALTY = 5;

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: ok ? '#059669' : '#e2e8f0' }}
    />
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium flex items-center gap-2" style={{ color: ok ? '#059669' : '#64748b' }}>
        <StatusDot ok={ok} />
        {value}
      </span>
    </div>
  );
}

export default function SessionPage() {
  const navigate = useNavigate();
  const sessionData = useSessionStore();
  const notificationsEnabled = sessionData.notificationsEnabled;
  const sensitivity = sessionData.sensitivity;
  const trackedMetrics = sessionData.trackedMetrics.map((metric) => metric.toLowerCase());
  const monitorsGaze = trackedMetrics.some((metric) => metric.includes('eye') || metric.includes('face'));
  const monitorsTalking = trackedMetrics.some(
    (metric) => metric.includes('typing') || metric.includes('conversation') || metric.includes('speech') || metric.includes('audio'),
  );

  const [elapsed, setElapsed] = useState(0);
  const [score, setScore] = useState(100);
  const [facePresent, setFacePresent] = useState(false);
  const [eyesFocused, setEyesFocused] = useState(true);
  const [isTalking, setIsTalking] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [notifGranted, setNotifGranted] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [distractions, setDistractions] = useState(0);
  const [activity, setActivity] = useState<{ t: number; msg: string }[]>([
    { t: 0, msg: 'Session started — initializing…' },
  ]);
  const [isActive, setIsActive] = useState(true);
  const [modelReady, setModelReady] = useState(false);
  const [coachingMessage, setCoachingMessage] = useState('');
  const [geminiStatus, setGeminiStatus] = useState('Connecting…');
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [emotion, setEmotion] = useState('Unknown');
  const [emotionConfidence, setEmotionConfidence] = useState(0);
  const [backendConnected, setBackendConnected] = useState(false);

  const elapsedRef = useRef(0);
  const scoreRef = useRef(100);
  const modelReadyRef = useRef(false);
  const lastNotifAtRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lookAwayStartRef = useRef<number | null>(null);
  const leftFrameStartRef = useRef<number | null>(null);
  const facePresentRef = useRef(true);
  const eyesFocusedRef = useRef(true);
  const geminiScoreRef = useRef<number | null>(null);
  const localAttentionRef = useRef(82);
  const noFaceSecondsRef = useRef(0);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendFacePresentRef = useRef(false);
  const backendConnectedRef = useRef(false);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { backendConnectedRef.current = backendConnected; }, [backendConnected]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', sessionData.themeMode === 'dark');
    document.documentElement.style.setProperty('--gradient-start', sessionData.accentColor);
    document.documentElement.style.setProperty('--font-scale',
      sessionData.fontScale === 'compact' ? '0.95' : sessionData.fontScale === 'large' ? '1.08' : '1.0');
  }, [sessionData.themeMode, sessionData.accentColor, sessionData.fontScale]);

  // --- Gemini Vision (primary attention source) ---
  const { analysis: geminiAnalysis, geminiAlerts, isAvailable: geminiAvailable } = useGeminiVision(isActive, videoRef);

  // Gemini is used ONLY for coaching messages — it does NOT affect the score.
  // Score only drops when fireNotification() is called (talking or look-away events).
  useEffect(() => {
    if (!geminiAnalysis) return;
    geminiScoreRef.current = geminiAnalysis.attentionScore;
    setGeminiStatus(`Gemini: ${geminiAnalysis.feedback}`);
    if (geminiAnalysis.coachingMessage) {
      setCoachingMessage(geminiAnalysis.coachingMessage);
      setTimeout(() => setCoachingMessage(''), 12000);
    }
  }, [geminiAnalysis]);

  // Pipe Gemini alerts into activity feed
  useEffect(() => {
    if (geminiAlerts.length === 0) return;
    const latest = geminiAlerts[0];
    setActivity(prev => [{ t: elapsedRef.current, msg: latest.msg }, ...prev].slice(0, 12));
  }, [geminiAlerts]);

  useEffect(() => {
    if (!isActive) return;
    let mounted = true;

    const pollBackendStatus = async () => {
      try {
        const response = await fetch(BACKEND_STATUS_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('status request failed');
        const payload = await response.json() as {
          ok?: boolean;
          status?: {
            num_faces?: number;
            emotion?: string;
            emotion_confidence?: number;
          };
        };

        if (!mounted) return;
        setBackendConnected(Boolean(payload.ok));

        const backendFaces = Number(payload.status?.num_faces ?? 0);
        backendFacePresentRef.current = backendFaces > 0;

        const backendEmotion = String(payload.status?.emotion ?? 'unknown');
        const backendEmotionConfidence = Number(payload.status?.emotion_confidence ?? 0);
        if (backendEmotion !== 'unknown') {
          setEmotion(backendEmotion[0].toUpperCase() + backendEmotion.slice(1));
          setEmotionConfidence(Math.round(backendEmotionConfidence * 100));
        }
      } catch {
        if (!mounted) return;
        setBackendConnected(false);
        backendFacePresentRef.current = false;
        setEmotion('Unknown');
        setEmotionConfidence(0);
      }
    };

    pollBackendStatus();
    const id = setInterval(pollBackendStatus, BACKEND_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isActive]);

  const pushActivity = useCallback((msg: string) => {
    setActivity(prev => [{ t: elapsedRef.current, msg }, ...prev].slice(0, 12));
  }, []);

  const showNudge = useCallback((msg: string) => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    setNudgeMessage(msg);
    nudgeTimerRef.current = setTimeout(() => setNudgeMessage(''), 4200);
  }, []);

  const playAlertTone = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ACtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 720;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    oscillator.onended = () => ctx.close().catch(() => {});
  }, []);

  const fireNotification = useCallback(async (reason: 'conversation' | 'look_away') => {
    const now = Date.now();
    if (now - lastNotifAtRef.current < NOTIF_COOLDOWN_MS) return;
    lastNotifAtRef.current = now;
    setDistractions(d => d + 1);
    const msg = reason === 'conversation' ? 'Distraction: conversation detected.' : 'Distraction: looking away.';
    pushActivity(msg);

    const minutesRemaining = Math.max(
      1,
      Math.ceil((sessionData.plannedDurationMinutes * 60 - elapsedRef.current) / 60),
    );

    try {
      let dispatched = false;
      if (sessionData.notificationsEnabled && (sessionData.alertMode === 'notification' || sessionData.alertMode === 'both')) {
        if (reason === 'conversation') dispatched = await sendTalkingNotification(minutesRemaining);
        else dispatched = await sendNoFaceNotification(minutesRemaining);
      }

      if (sessionData.alertMode === 'sound' || sessionData.alertMode === 'both') {
        playAlertTone();
      }

      if (!dispatched) {
        const fallback = reason === 'conversation'
          ? 'Conversation detected. Refocus now.'
          : 'No face or focus drift detected. Return to screen.';
        showNudge(fallback);
        pushActivity(`In-app nudge: ${fallback}`);
      }
    } catch (e) {
      console.error('[Productifi] notification failed:', e);
      const fallback = reason === 'conversation'
        ? 'Conversation detected. Refocus now.'
        : 'No face or focus drift detected. Return to screen.';
      showNudge(fallback);
    }

    const strictnessMultiplier = 0.7 + (sessionData.sensitivity / 100) * 0.9;
    const basePenalty = reason === 'conversation' ? SCORE_CONVERSATION_PENALTY : SCORE_LOOK_AWAY_PENALTY;
    const penalty = Math.round(basePenalty * strictnessMultiplier);
    scoreRef.current = Math.max(0, scoreRef.current - penalty);
    setScore(scoreRef.current);
  }, [pushActivity, playAlertTone, sessionData.alertMode, sessionData.notificationsEnabled, sessionData.plannedDurationMinutes, sessionData.sensitivity, showNudge]);

  // Timer
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // Main media + detection loop
  useEffect(() => {
    if (!isActive) return;

    let mounted = true;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let faceInterval: ReturnType<typeof setInterval> | undefined;
    let audioInterval: ReturnType<typeof setInterval> | undefined;
    let scoreInterval: ReturnType<typeof setInterval> | undefined;
    let talkStartMs: number | null = null;

    lastNotifAtRef.current = 0;
    resetNotificationCooldown();
    scoreRef.current = 100;
    lookAwayStartRef.current = null;
    leftFrameStartRef.current = null;
    noFaceSecondsRef.current = 0;

    const ensureNotifPermission = async () => {
      if (typeof Notification === 'undefined') return;
      if (!notificationsEnabled) {
        if (mounted) setNotifGranted(false);
        return;
      }
      const result = await requestNotificationPermission();
      if (mounted) setNotifGranted(result === 'granted');
      if (mounted && result !== 'granted' && notificationsEnabled) {
        pushActivity('Notifications unavailable: browser permission not granted. Using in-app alerts.');
      }
    };

    const handleVisibility = () => {
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };

    const init = async () => {
      await ensureNotifPermission();

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch { /* ignore */ }
        }
        setCameraReady(true);
        pushActivity('Camera and microphone ready');

        audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyser.fftSize);

        document.addEventListener('visibilitychange', handleVisibility);

        audioInterval = setInterval(() => {
          if (!mounted || !audioCtx || !analyser) return;
          if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

          if (!monitorsTalking) {
            talkStartMs = null;
            if (mounted) setIsTalking(false);
            return;
          }

          analyser.getByteFrequencyData(freqData);
          let sumF = 0;
          for (let i = 0; i < freqData.length; i++) sumF += freqData[i];
          const avgFreq = freqData.length > 0 ? sumF / freqData.length : 0;

          analyser.getByteTimeDomainData(timeData);
          let sumT = 0;
          for (let i = 0; i < timeData.length; i++) {
            const n = (timeData[i] - 128) / 128;
            sumT += n * n;
          }
          const rms = Math.sqrt(sumT / timeData.length) * 100;
          const amplitude = avgFreq * 0.5 + rms * 0.5;
          const isLoud = amplitude > AUDIO_THRESHOLD;

          if (isLoud) {
            if (talkStartMs === null) talkStartMs = Date.now();
            if (mounted) setIsTalking(true);
            if (Date.now() - talkStartMs >= SUSTAINED_TALK_MS) {
              fireNotification('conversation');
              talkStartMs = Date.now();
            }
          } else {
            talkStartMs = null;
            if (mounted) setIsTalking(false);
          }
        }, AUDIO_INTERVAL_MS);

        if (mounted) setMicReady(true);

        // TF.js face detection (fast loop — supplements Gemini)
        const faceModule = await import('@tensorflow-models/face-detection');
        await import('@tensorflow/tfjs');
        let detector;
        try {
          detector = await faceModule.createDetector(
            faceModule.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'mediapipe',
              solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection',
              maxFaces: 1,
              modelType: 'short',
            },
          );
          pushActivity('Vision model: MediaPipe runtime active');
        } catch {
          detector = await faceModule.createDetector(
            faceModule.SupportedModels.MediaPipeFaceDetector,
            { runtime: 'tfjs', maxFaces: 1 },
          );
          pushActivity('Vision model: TF.js fallback active');
        }

        await new Promise<void>(resolve => {
          const v = videoRef.current;
          if (!v || v.readyState >= 2) { resolve(); return; }
          const onReady = () => { v.removeEventListener('canplay', onReady); resolve(); };
          v.addEventListener('canplay', onReady);
          setTimeout(resolve, 5000);
        });

        if (mounted) {
          pushActivity('Face detection ready — Gemini Vision active');
          setModelReady(true);
          modelReadyRef.current = true;
        }

        faceInterval = setInterval(async () => {
          if (!mounted || !modelReadyRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState < 2 || v.videoWidth === 0) return;

          try {
            const faces = await detector.estimateFaces(v);
            if (!mounted) return;

            const detectedLocal = faces.length > 0;
            const detected = detectedLocal || backendFacePresentRef.current;
            facePresentRef.current = detected;
            setFacePresent(detected);

            let focused = false;
            if (detectedLocal) {
              const { box } = faces[0];
              const cx = box.xMin + box.width / 2;
              const cy = box.yMin + box.height / 2;
              const hOff = Math.abs(cx - v.videoWidth / 2) / (v.videoWidth / 2);
              const vOff = Math.abs(cy - v.videoHeight / 2) / (v.videoHeight / 2);
              const areaRatio = (box.width * box.height) / (v.videoWidth * v.videoHeight);

              const strictness = sensitivity / 100;
              const hThresh = 0.48 - strictness * 0.18;
              const vThresh = 0.46 - strictness * 0.16;
              const areaThresh = 0.015 + strictness * 0.015;

              focused = monitorsGaze
                ? (hOff < hThresh && vOff < vThresh && areaRatio > areaThresh)
                : detected;

              const positionScore = Math.max(0, 100 - hOff * 80 - vOff * 55);
              const sizeScore = Math.max(0, Math.min(100, (areaRatio / 0.055) * 100));
              const instantLocal = positionScore * 0.72 + sizeScore * 0.28;
              localAttentionRef.current = localAttentionRef.current * 0.7 + instantLocal * 0.3;
            } else if (backendFacePresentRef.current) {
              focused = true;
              localAttentionRef.current = Math.max(58, localAttentionRef.current * 0.92);
            } else {
              localAttentionRef.current = localAttentionRef.current * 0.74;
              geminiScoreRef.current = null;
            }
            eyesFocusedRef.current = focused;
            setEyesFocused(focused);

            const now = Date.now();
            if (!monitorsGaze) {
              lookAwayStartRef.current = null;
              leftFrameStartRef.current = null;
            } else if (!detected) {
              if (leftFrameStartRef.current === null) leftFrameStartRef.current = now;
              lookAwayStartRef.current = null;
              if (now - leftFrameStartRef.current >= LOOK_AWAY_TRIGGER_MS) {
                fireNotification('look_away');
                leftFrameStartRef.current = now;
              }
            } else {
              leftFrameStartRef.current = null;
              if (!focused) {
                if (lookAwayStartRef.current === null) lookAwayStartRef.current = now;
                if (now - lookAwayStartRef.current >= LOOK_AWAY_TRIGGER_MS) {
                  fireNotification('look_away');
                  lookAwayStartRef.current = now;
                }
              } else {
                lookAwayStartRef.current = null;
              }
            }
          } catch { /* keep previous state */ }
        }, FACE_INTERVAL_MS);

        // Score tick — blend local CV + Gemini and move smoothly toward target.
        scoreInterval = setInterval(() => {
          if (!mounted || !modelReadyRef.current) return;
          const fp = facePresentRef.current;
          const ef = eyesFocusedRef.current;
          const local = localAttentionRef.current;
          const gemini = geminiScoreRef.current;

          if (!fp) {
            noFaceSecondsRef.current += 1;
            const decay = Math.min(10, 3.6 + noFaceSecondsRef.current * 0.45);
            const degradedFloor = backendConnectedRef.current ? 0 : 12;
            scoreRef.current = Math.max(degradedFloor, scoreRef.current - decay);
            setScore(Math.round(scoreRef.current));
            return;
          }

          noFaceSecondsRef.current = 0;

          const modelTarget = gemini !== null ? (local * 0.65 + gemini * 0.35) : local;
          const target = ef
            ? Math.max(0, Math.min(100, modelTarget + 2))
            : Math.max(0, Math.min(42, modelTarget - 20));

          const delta = target - scoreRef.current;
          const step = Math.max(-6, Math.min(4.5, delta * 0.24));
          scoreRef.current = Math.max(0, Math.min(100, scoreRef.current + step));
          setScore(Math.round(scoreRef.current));
        }, 1000);

      } catch (err) {
        console.warn('[Productifi] media init failed:', err);
        if (!mounted) return;
        setCameraReady(false);
        setMicReady(false);
        pushActivity('Camera/mic unavailable');
      }
    };

    init();

    return () => {
      mounted = false;
      if (faceInterval) clearInterval(faceInterval);
      if (audioInterval) clearInterval(audioInterval);
      if (scoreInterval) clearInterval(scoreInterval);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
    };
  }, [isActive, fireNotification, monitorsGaze, monitorsTalking, notificationsEnabled, pushActivity, sensitivity]);

  const endSession = () => {
    setIsActive(false);
    sessionData.recordCompletedSession(distractions, score, elapsed);
    navigate('/report');
  };

  const fmt = (sec: number) =>
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const scoreColor = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const scoreLabel = score >= 75 ? 'Focused' : score >= 50 ? 'Moderate' : 'Distracted';
  const progressColor = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const totalSeconds = Math.max(1, sessionData.plannedDurationMinutes * 60);
  const progressPct = Math.max(0, Math.min(100, Math.round((elapsed / totalSeconds) * 100)));

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col">
      <header className="bg-white rounded-b-2xl shadow-card px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="font-semibold bg-gradient-productifi bg-clip-text text-transparent text-base">Productifi</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-sm">{sessionData.sessionName || 'Focus Session'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="w-2 h-2 rounded-full bg-[#5B8CFF]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            Session active
          </span>
          <div className="flex-1 max-w-xs">
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div className="bg-gradient-productifi h-2 rounded-full" style={{ width: `${progressPct}%` }}></div>
            </div>
            <p className="text-xs text-slate-500 mt-1">Progress: {progressPct}%</p>
          </div>
          <span className="font-mono text-slate-700 font-medium text-sm bg-slate-100 px-3 py-1.5 rounded-xl tabular-nums">
            {fmt(elapsed)}
          </span>
          <button
            onClick={endSession}
            className="bg-gradient-productifi hover:shadow-btn-glow text-white text-sm font-medium px-4 py-2 rounded-xl transition-all duration-300"
          >
            End Session
          </button>
        </div>
      </header>

      {!notifGranted && (
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
          <p className="text-amber-800 text-sm">Enable notifications to get focus alerts when you switch tabs.</p>
          <button
            onClick={async () => {
              const p = await requestNotificationPermission();
              setNotifGranted(p === 'granted');
            }}
            className="shrink-0 text-sm font-medium text-amber-900 underline"
          >
            Enable
          </button>
        </div>
      )}

      {nudgeMessage && (
        <div className="bg-rose-50 border-b border-rose-100 px-6 py-2.5 text-sm text-rose-700">
          {nudgeMessage}
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video feed */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="card overflow-hidden">
            <div className="relative bg-slate-800" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-slate-500 border-t-blue-400 rounded-full mx-auto mb-3" style={{ animation: 'spin 1s linear infinite' }} />
                    <p className="text-slate-400 text-sm">Starting camera…</p>
                  </div>
                </div>
              )}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {cameraReady && <span className="text-xs font-medium text-white/90 bg-black/30 px-2 py-1 rounded">Camera on</span>}
                {cameraReady && !facePresent && <span className="text-xs font-medium text-amber-200 bg-amber-900/40 px-2 py-1 rounded">No face detected</span>}
                {isTalking && <span className="text-xs font-medium text-red-200 bg-red-900/40 px-2 py-1 rounded">Speaking</span>}
              </div>
              {/* Gemini status badge */}
              {geminiAvailable && (
                <div className="absolute top-3 right-3">
                  <span className="flex items-center gap-1 text-xs font-medium text-white/90 bg-black/40 px-2 py-1 rounded">
                    <Sparkles className="w-3 h-3 text-[#0d9488]" />
                    Gemini
                  </span>
                </div>
              )}
            </div>
            <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100">
              <span className="text-xs text-slate-500">{sessionData.sessionType} · {sessionData.focusRule}</span>
              <span className="text-xs text-slate-400">
                {distractions === 0 ? 'No distractions' : `${distractions} distraction${distractions > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          <div className="card px-5 py-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Primary Goal</p>
            <p className="text-sm text-slate-700">{sessionData.productivityGoal || 'Maintain deep focus'}</p>
          </div>

          {/* Gemini live status */}
          {modelReady && (
            <div className="card px-5 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2563eb]/15 to-[#0d9488]/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-[#0d9488]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Gemini Vision</p>
                <p className="text-sm text-slate-600 truncate">{geminiAvailable ? geminiStatus : 'Analyzing your focus…'}</p>
              </div>
              {geminiAnalysis && (
                <span className="text-xs font-mono font-bold shrink-0" style={{ color: scoreColor }}>
                  {geminiAnalysis.attentionScore}
                </span>
              )}
            </div>
          )}

          {/* Coaching nudge */}
          {coachingMessage && (
            <div className="card px-5 py-4 border-l-4 border-[#5B8CFF] bg-gradient-to-r from-[#5B8CFF]/5 to-transparent">
              <p className="text-xs font-semibold text-[#5B8CFF] uppercase tracking-wider mb-1">Gemini Coach</p>
              <p className="text-sm text-slate-700">{coachingMessage}</p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-5">
          {/* Attention score */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Attention Score</p>
              {geminiAvailable && (
                <span className="flex items-center gap-1 text-xs text-[#0d9488] font-medium">
                  <Sparkles className="w-3 h-3" /> Gemini
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor }}>{score}</span>
              <span className="text-slate-400">/ 100</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
              <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: progressColor }} />
            </div>
            <p className="text-sm font-medium" style={{ color: scoreColor }}>
              {modelReady ? scoreLabel : 'Loading model…'}
            </p>
          </div>

          {/* Status */}
          <div className="card p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Status</p>
            <StatusRow label="Camera" value={cameraReady ? 'On' : 'Off'} ok={cameraReady} />
            <StatusRow label="Microphone" value={!micReady ? 'Off' : isTalking ? 'Speaking' : 'Listening'} ok={micReady} />
            <StatusRow label="Notifications" value={notifGranted ? 'Enabled' : 'Disabled'} ok={notifGranted} />
            <StatusRow label="Face" value={facePresent ? 'Detected' : 'Not detected'} ok={facePresent} />
            <StatusRow label="Eyes on screen" value={eyesFocused ? 'Yes' : 'No'} ok={eyesFocused} />
            <StatusRow label="Speaking" value={monitorsTalking ? (isTalking ? 'Yes' : 'No') : 'Disabled'} ok={!monitorsTalking || !isTalking} />
            <StatusRow label="Gemini Vision" value={geminiAvailable ? 'Active' : 'Loading…'} ok={geminiAvailable} />
            <StatusRow label="Backend CV" value={backendConnected ? 'Connected' : 'Offline'} ok={backendConnected} />
            <StatusRow
              label="Emotion"
              value={emotionConfidence > 0 ? `${emotion} (${emotionConfidence}%)` : emotion}
              ok={emotion !== 'Unknown'}
            />
          </div>

          <div className="card p-5 border border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Live Performance</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Distractions</p>
                <p className="text-xl font-bold text-slate-800">{distractions}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Mode</p>
                <p className="text-sm font-semibold text-slate-700">{sessionData.focusRule}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Current strictness uses sensitivity <strong>{sessionData.sensitivity}</strong>. Increase it in Customize to make attention scoring stricter.
            </p>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Active metrics: <strong>{sessionData.trackedMetrics.length}</strong> ({monitorsGaze ? 'gaze on' : 'gaze off'} · {monitorsTalking ? 'speech on' : 'speech off'}).
            </p>
          </div>
        </div>

        {/* Activity feed */}
        <div className="lg:col-span-3 card p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Activity</p>
          <div className="space-y-1.5">
            {activity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-1">
                <span className="font-mono text-slate-400 text-xs shrink-0 w-12">{fmt(item.t)}</span>
                <span className="text-sm text-slate-600">{item.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
