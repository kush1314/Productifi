/**
 * audioMonitor.ts
 *
 * Standalone microphone volume monitor.
 *
 * - Uses Web Audio API (AnalyserNode) for amplitude measurement.
 * - Uses setInterval (NOT requestAnimationFrame) so it keeps running
 *   when the Productifi tab is in the background.
 * - Uses Date.now() wall-clock timing so browser timer throttling
 *   (Chrome throttles background tabs to ~1 Hz) doesn't break the 3-second window.
 * - Fires onSustainedSpeech() after SUSTAINED_SPEAK_MS of continuous loud audio.
 *   Resets immediately so it can fire again after another sustained window.
 * - Returns a cleanup function that stops the mic and all intervals.
 */

const SAMPLE_INTERVAL_MS  = 100;   // poll audio every 100 ms
const VOLUME_THRESHOLD    = 15;    // amplitude 0–255 above which we consider "loud"
const SUSTAINED_SPEAK_MS  = 3_000; // 3 continuous seconds to trigger
const COOLDOWN_MS         = 20_000; // 20 seconds cooldown between triggers

export interface AudioMonitorOptions {
  /** Called after SUSTAINED_SPEAK_MS of continuous audio above threshold. */
  onSustainedSpeech: () => void;
  /** Called on every sample tick with current volume (0–255) and whether it's above threshold. */
  onVolumeChange?: (volume: number, isSpeaking: boolean) => void;
  /** Override default amplitude threshold (default: 15). */
  volumeThreshold?: number;
  /** Override default sustained speaking duration in ms (default: 3000). */
  sustainedMs?: number;
  /** Override default cooldown duration in ms (default: 20000). */
  cooldownMs?: number;
}

/**
 * Start monitoring the microphone. Requests mic permission internally.
 *
 * @returns Promise that resolves to a stop() cleanup function on success,
 *          or rejects if mic permission is denied.
 */
export async function startAudioMonitor(options: AudioMonitorOptions): Promise<() => void> {
  const {
    onSustainedSpeech,
    onVolumeChange,
    volumeThreshold = VOLUME_THRESHOLD,
    sustainedMs     = SUSTAINED_SPEAK_MS,
    cooldownMs      = COOLDOWN_MS,
  } = options;

  // Request mic
  const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const source   = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  const freqData   = new Uint8Array(analyser.frequencyBinCount);
  let talkStartMs: number | null = null;
  let lastTriggerMs: number | null = null;
  let stopped = false;

  // Resume AudioContext when tab becomes visible again (Chrome suspends it in background)
  const handleVisibility = () => {
    if (!stopped && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  };
  document.addEventListener('visibilitychange', handleVisibility);

  const intervalId = setInterval(() => {
    if (stopped || !analyser) return;

    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    analyser.getByteFrequencyData(freqData);
    const avg    = freqData.reduce((sum, v) => sum + v, 0) / freqData.length;
    const isLoud = avg > volumeThreshold;

    onVolumeChange?.(avg, isLoud);

    const now = Date.now();

    if (isLoud) {
      if (talkStartMs === null) {
        talkStartMs = now;
      }
      const elapsed = now - talkStartMs;
      if (elapsed >= sustainedMs) {
        if (!lastTriggerMs || now - lastTriggerMs >= cooldownMs) {
          onSustainedSpeech();
          lastTriggerMs = now;
        }
        talkStartMs = now; // reset so it can fire again after cooldown
      }
    } else {
      talkStartMs = null; // silence breaks the window
    }
  }, SAMPLE_INTERVAL_MS);

  // Return cleanup
  return () => {
    stopped = true;
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibility);
    stream.getTracks().forEach(t => t.stop());
    audioCtx.close().catch(() => {});
  };
}
