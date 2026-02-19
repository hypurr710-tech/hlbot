"use client";

import { useState, useRef, useCallback } from "react";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export function useVoice(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");

  const startListening = useCallback(() => {
    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    if (!SR) {
      alert("Your browser doesn't support speech recognition. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    finalTranscriptRef.current = "";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimText(finalTranscriptRef.current + interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = finalTranscriptRef.current.trim();
      setInterimText("");
      if (text) {
        onResult(text);
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", e.error);
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setInterimText("");
  }, [onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { isListening, interimText, startListening, stopListening };
}

/** Speak text using browser SpeechSynthesis */
export function speak(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
) {
  if (typeof window === "undefined") return;

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  utterance.pitch = 1.05;

  // Try to pick a nice voice
  const voices = speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.name.includes("Samantha")) ||
    voices.find((v) => v.name.includes("Google US English")) ||
    voices.find((v) => v.lang === "en-US" && !v.localService) ||
    voices.find((v) => v.lang === "en-US");
  if (preferred) utterance.voice = preferred;

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => onEnd?.();

  speechSynthesis.speak(utterance);
}

/** Stop any ongoing speech */
export function stopSpeaking() {
  if (typeof window === "undefined") return;
  speechSynthesis.cancel();
}
