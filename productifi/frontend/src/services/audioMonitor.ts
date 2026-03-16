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
  /** Reuse an existing MediaStream (e.g. same stream used by <video>). */
  stream?: MediaStream;
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
    stream: externalStream,
  } = options;

  // Request mic only when caller didn't provide an existing stream
  const ownsStream = !externalStream;
  const stream = externalStream ?? await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const source   = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);
  let talkStartMs: number | null = null;
  let lastTriggerMs: number | null = null;
  let stopped = false;
  let recorder: MediaRecorder | null = null;
  let recorderBaseline = 0;
  let recorderSamples = 0;
  let recorderLastChunkAt = 0;

  // Dynamic noise-floor calibration so "any talking" is detected even in noisy rooms.
  let noiseFloor = 0;
  let calibrating = true;
  const calibrationStartedAt = Date.now();

  const evaluateSample = (amplitude: number) => {
    const now = Date.now();
    if (calibrating) {
      noiseFloor = noiseFloor === 0 ? amplitude : noiseFloor * 0.9 + amplitude * 0.1;
      if (now - calibrationStartedAt > 1500) calibrating = false;
    } else {
      noiseFloor = noiseFloor * 0.98 + amplitude * 0.02;
    }

    const adaptiveThreshold = Math.max(volumeThreshold, noiseFloor + 3.5);
    const isLoud = amplitude > adaptiveThreshold;
    onVolumeChange?.(amplitude, isLoud);

    if (isLoud) {
      if (talkStartMs === null) talkStartMs = now;
      const elapsed = now - talkStartMs;
      if (elapsed >= sustainedMs) {
        if (!lastTriggerMs || now - lastTriggerMs >= cooldownMs) {
          onSustainedSpeech();
          lastTriggerMs = now;
        }
        talkStartMs = now;
      }
    } else {
      talkStartMs = null;
    }
  };

  let processor: ScriptProcessorNode | null = null;
  try {
    processor = audioCtx.createScriptProcessor(2048, 1, 1);
    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const input = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length) * 100;
      evaluateSample(rms);
    };
  } catch {
    processor = null;
  }

  // Resume AudioContext when tab becomes visible again (Chrome suspends it in background)
  const handleVisibility = () => {
    if (!stopped && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Backup detector for hidden-tab scenarios where analyser callbacks may be throttled.
  if (typeof MediaRecorder !== 'undefined') {
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (stopped) return;

        const size = event.data?.size ?? 0;
        recorderLastChunkAt = Date.now();

        if (!document.hidden) {
          recorderSamples = Math.min(8, recorderSamples + 1);
          recorderBaseline = recorderBaseline === 0 ? size : recorderBaseline * 0.8 + size * 0.2;
          return;
        }

        const baseline = recorderSamples > 0 ? recorderBaseline : 800;
        const threshold = Math.max(1100, baseline * 1.35);
        const pseudoAmplitude = size > threshold
          ? volumeThreshold + Math.min(30, (size - threshold) / 220)
          : Math.max(0, volumeThreshold - 4);

        evaluateSample(pseudoAmplitude);
      };
      recorder.start(1000);
    } catch {
      recorder = null;
    }
  }

  const intervalId = setInterval(() => {
    if (stopped || !analyser) return;

    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const hiddenRecorderHealthy = document.hidden && recorder && (Date.now() - recorderLastChunkAt < 3200);
    if (hiddenRecorderHealthy) return;

    // Fallback polling path when ScriptProcessor is unavailable OR hidden recorder is not healthy.
    if (!processor || (document.hidden && recorder)) {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      let sumF = 0;
      for (let i = 0; i < freqData.length; i++) sumF += freqData[i];
      const avgFreq = freqData.length > 0 ? sumF / freqData.length : 0;

      let sumT = 0;
      for (let i = 0; i < timeData.length; i++) {
        const n = (timeData[i] - 128) / 128;
        sumT += n * n;
      }
      const rms = Math.sqrt(sumT / timeData.length) * 100;
      evaluateSample(avgFreq * 0.5 + rms * 0.5);
    }
  }, SAMPLE_INTERVAL_MS);

  // Return cleanup
  return () => {
    stopped = true;
    clearInterval(intervalId);
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
    }
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* ignore */ }
    }
    document.removeEventListener('visibilitychange', handleVisibility);
    if (ownsStream) stream.getTracks().forEach(t => t.stop());
    audioCtx.close().catch(() => {});
  };
}
