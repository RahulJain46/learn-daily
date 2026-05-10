"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API wrapper. Both halves are client-side and free:
 *   - SpeechRecognition: dictation (Chrome/Edge/Safari only — no Firefox)
 *   - speechSynthesis: TTS (universal)
 *
 * Returns sane no-op fallbacks when APIs are missing so callers don't need
 * to branch on support.
 */

type SpeechRecognitionEventLike = {
  /**
   * Index of the first new result in `results`. Crucial — without this,
   * iterating from 0 each event re-counts every previously-finalized result
   * and you get exponential duplication of the transcript.
   */
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

interface VoiceState {
  recognitionSupported: boolean;
  synthesisSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  /** Cumulative interim + final transcript while listening. */
  liveTranscript: string;
  error: string | null;
}

interface VoiceControls extends VoiceState {
  startListening: () => void;
  stopListening: () => void;
  /** Speak a message. Cancels any in-flight speech first. */
  speak: (text: string, opts?: { onEnd?: () => void }) => void;
  cancelSpeech: () => void;
}

export function useVoice(opts: {
  /** Called with the final recognized text when listening stops. */
  onFinalTranscript?: (text: string) => void;
  lang?: string;
} = {}): VoiceControls {
  const { onFinalTranscript, lang = "en-US" } = opts;

  const [state, setState] = useState<VoiceState>({
    recognitionSupported: false,
    synthesisSupported: false,
    isListening: false,
    isSpeaking: false,
    liveTranscript: "",
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    const synthesisSupported =
      typeof window.speechSynthesis !== "undefined";

    if (!SR && !synthesisSupported) {
      setState((s) => ({ ...s, recognitionSupported: false, synthesisSupported }));
      return;
    }

    if (SR) {
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: SpeechRecognitionEventLike) => {
        // Only walk results new since the last event (the spec re-emits the
        // full list every time). Skipping `resultIndex` is what was causing
        // the runaway duplication of recognized phrases.
        let interim = "";
        let final = finalTranscriptRef.current;
        const startIdx = typeof e.resultIndex === "number" ? e.resultIndex : 0;
        for (let i = startIdx; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            const piece = text.trim();
            if (piece) final += (final ? " " : "") + piece;
          } else {
            interim += text;
          }
        }
        finalTranscriptRef.current = final;
        const composed = (final + (interim ? " " + interim : "")).trim();
        setState((s) => ({ ...s, liveTranscript: composed, error: null }));
      };
      rec.onerror = (e: { error: string }) => {
        // "no-speech" / "aborted" are noisy but harmless
        if (e.error !== "no-speech" && e.error !== "aborted") {
          setState((s) => ({ ...s, error: `Mic error: ${e.error}` }));
        }
      };
      rec.onend = () => {
        const finalText = finalTranscriptRef.current.trim();
        setState((s) => ({ ...s, isListening: false }));
        if (finalText && onFinalTranscriptRef.current) {
          onFinalTranscriptRef.current(finalText);
        }
        finalTranscriptRef.current = "";
      };
      recognitionRef.current = rec;
    }

    setState((s) => ({
      ...s,
      recognitionSupported: !!SR,
      synthesisSupported,
    }));

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        if (synthesisSupported) window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    };
  }, [lang]);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    finalTranscriptRef.current = "";
    setState((s) => ({ ...s, liveTranscript: "", error: null, isListening: true }));
    try {
      rec.start();
    } catch (e) {
      setState((s) => ({
        ...s,
        isListening: false,
        error: e instanceof Error ? e.message : "Could not start mic",
      }));
    }
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore — `onend` will fire and update state
    }
  }, []);

  const speak = useCallback(
    (text: string, speakOpts: { onEnd?: () => void } = {}) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.onstart = () => setState((s) => ({ ...s, isSpeaking: true }));
        utter.onend = () => {
          setState((s) => ({ ...s, isSpeaking: false }));
          speakOpts.onEnd?.();
        };
        utter.onerror = () => setState((s) => ({ ...s, isSpeaking: false }));
        window.speechSynthesis.speak(utter);
      } catch (e) {
        setState((s) => ({
          ...s,
          isSpeaking: false,
          error: e instanceof Error ? e.message : "Speech synthesis failed",
        }));
      }
    },
    [lang]
  );

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      setState((s) => ({ ...s, isSpeaking: false }));
    } catch {
      // ignore
    }
  }, []);

  return { ...state, startListening, stopListening, speak, cancelSpeech };
}
