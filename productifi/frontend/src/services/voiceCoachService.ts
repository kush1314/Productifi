export function isVoiceCoachSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let selectedVoice: SpeechSynthesisVoice | undefined;
let voicesWarmed = false;
let lastSpokenAt = 0;
let lastSpokenMessage = '';

interface SpeakOptions {
  interrupt?: boolean;
  urgent?: boolean;
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.find(
    (v) => v.lang.toLowerCase().startsWith('en')
      && /samantha|alex|daniel|victoria|allison|ava|google|serena|karen|moira|zira/i.test(v.name),
  );
  if (english) return english;

  const localEnglish = voices.find((v) => v.lang.toLowerCase().startsWith('en') && v.localService);
  if (localEnglish) return localEnglish;

  return voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0];
}

function normalizeMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function chunkMessage(message: string, maxLen = 140): string[] {
  if (message.length <= maxLen) return [message];

  const chunks: string[] = [];
  const sentences = message.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + ' ' + sentence).trim().length <= maxLen) {
      current = `${current} ${sentence}`.trim();
      continue;
    }
    if (current) chunks.push(current);
    current = sentence.trim();
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [message];
}

export function warmupVoiceCoach(): void {
  if (!isVoiceCoachSupported()) return;
  if (voicesWarmed) return;

  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length > 0) {
    selectedVoice = pickBestVoice(voices);
    voicesWarmed = true;
    return;
  }

  const onVoicesChanged = () => {
    const updated = synth.getVoices();
    if (updated.length > 0) {
      selectedVoice = pickBestVoice(updated);
      voicesWarmed = true;
      synth.onvoiceschanged = null;
    }
  };

  synth.onvoiceschanged = onVoicesChanged;
}

export function stopVoiceCoach(): void {
  if (!isVoiceCoachSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakCoachMessage(message: string, options: SpeakOptions = {}): boolean {
  if (!isVoiceCoachSupported()) return false;
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length === 0) return false;

  const now = Date.now();
  const synth = window.speechSynthesis;
  warmupVoiceCoach();

  if (!options.interrupt && synth.speaking) {
    return false;
  }

  if (!options.interrupt && now - lastSpokenAt < 3500) {
    return false;
  }

  if (!options.interrupt && normalized === lastSpokenMessage && now - lastSpokenAt < 10000) {
    return false;
  }

  try {
    if (options.interrupt) {
      synth.cancel();
    }

    const voices = synth.getVoices();
    const voice = selectedVoice || pickBestVoice(voices);
    if (voice) selectedVoice = voice;

    const chunks = chunkMessage(normalized);
    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = options.urgent ? 0.98 : 0.92;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';
      if (selectedVoice) utterance.voice = selectedVoice;
      synth.speak(utterance);
    }

    lastSpokenAt = now;
    lastSpokenMessage = normalized;
    return true;
  } catch (error) {
    console.warn('[VoiceCoach] speech synthesis failed:', error);
    return false;
  }
}
