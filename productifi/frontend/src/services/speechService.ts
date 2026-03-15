/**
 * speechService.ts
 * Optional transcript display via Web Speech API. Session notifications
 * use Web Audio API (amplitude/RMS) in SessionPage, not this service.
 */

import { useState, useEffect, useRef } from 'react';

const SILENCE_TIMEOUT_MS = 2_000;

export function useSpeechDetection(isActive: boolean) {
  const [isTalking, setIsTalking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const Win = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Impl = Win.SpeechRecognition || Win.webkitSpeechRecognition;

    if (!Impl) {
      return;
    }

    setIsSupported(true);

    if (!isActive) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setIsTalking(false);
      return;
    }

    const recognition = new Impl() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      maxAlternatives: number;
      start: () => void;
      stop: () => void;
      onspeechstart: () => void;
      onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
      onspeechend: () => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
    };

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    const startSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setIsTalking(false);
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onspeechstart = () => {
      if (!mountedRef.current) return;
      setIsTalking(true);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      if (!mountedRef.current) return;
      const len = event.results.length;
      const last = event.results[len - 1];
      if (last && last[0]) setTranscript(last[0].transcript);
      setIsTalking(true);
      startSilenceTimer();
    };

    recognition.onspeechend = () => {
      startSilenceTimer();
    };

    recognition.onerror = (event: { error: string }) => {
      if (!mountedRef.current) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('[Speech] Error:', event.error);
    };

    recognition.onend = () => {
      if (!mountedRef.current || !recognitionRef.current) return;
      try {
        recognition.start();
      } catch {
        /* already started */
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn('[Speech] Could not start:', e);
    }

    return () => {
      recognitionRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, [isActive]);

  return { isTalking, transcript, isSupported };
}
