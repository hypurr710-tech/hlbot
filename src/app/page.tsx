"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import VoiceVisualizer from "@/components/VoiceVisualizer";
import { useVoice } from "@/lib/useVoice";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function ApiKeyModal({
  onSave,
}: {
  onSave: (key: string) => void;
}) {
  const [key, setKey] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Welcome to Aria</h2>
          <p className="text-sm text-white/50">
            Enter your OpenAI API key to start practicing English.
            Your key is stored only in your browser.
          </p>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#ff6b6b]/50 transition-colors"
          onKeyDown={(e) => {
            if (e.key === "Enter" && key.trim()) onSave(key.trim());
          }}
        />
        <button
          onClick={() => key.trim() && onSave(key.trim())}
          disabled={!key.trim()}
          className="w-full mt-4 py-3 bg-gradient-to-r from-[#ff6b6b] to-[#ee5a24] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Start Conversation
        </button>
      </div>
    </div>
  );
}

export default function SpeakingPartner() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isRecording, audioLevel, startRecording, stopRecording } = useVoice();

  // Load API key from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("aria_api_key");
    if (stored) setApiKey(stored);
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const saveApiKey = (key: string) => {
    localStorage.setItem("aria_api_key", key);
    setApiKey(key);
  };

  const speak = useCallback(
    async (text: string) => {
      if (!apiKey || !autoSpeak) return;
      setIsSpeaking(true);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ text, voice: "nova" }),
        });
        if (!res.ok) throw new Error("TTS failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.play();
      } catch (err) {
        console.error("TTS error:", err);
        setIsSpeaking(false);
      }
    },
    [apiKey, autoSpeak]
  );

  const sendToChat = useCallback(
    async (userText: string) => {
      if (!apiKey) return;

      const userMessage: Message = { role: "user", content: userText };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsProcessing(true);
      setStreamingText("");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) throw new Error("Chat request failed");

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const data = JSON.parse(line.slice(6));
                  fullText += data.text;
                  setStreamingText(fullText);
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: fullText,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingText("");
        setIsProcessing(false);

        // Speak the response
        speak(fullText);
      } catch (err) {
        console.error("Chat error:", err);
        setIsProcessing(false);
        setStreamingText("");
      }
    },
    [apiKey, messages, speak]
  );

  const handleRecordToggle = async () => {
    if (isSpeaking) {
      // Stop current playback
      audioRef.current?.pause();
      setIsSpeaking(false);
      return;
    }

    if (isRecording) {
      // Stop recording and process
      const audioBlob = await stopRecording();
      if (!audioBlob || !apiKey) return;

      setIsProcessing(true);
      setCurrentTranscript("Listening...");

      try {
        // Send to Whisper for transcription
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        const res = await fetch("/api/stt", {
          method: "POST",
          headers: { "x-api-key": apiKey },
          body: formData,
        });

        if (!res.ok) throw new Error("STT failed");
        const { text } = await res.json();

        if (text && text.trim()) {
          setCurrentTranscript("");
          sendToChat(text.trim());
        } else {
          setCurrentTranscript("");
          setIsProcessing(false);
        }
      } catch (err) {
        console.error("STT error:", err);
        setCurrentTranscript("");
        setIsProcessing(false);
      }
    } else {
      // Start recording
      try {
        await startRecording();
      } catch {
        alert("Microphone access is required for voice chat.");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector("input") as HTMLInputElement;
    const text = input.value.trim();
    if (!text || isProcessing) return;
    input.value = "";
    sendToChat(text);
  };

  if (!apiKey) {
    return <ApiKeyModal onSave={saveApiKey} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f0f1a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Aria</h1>
            <p className="text-[11px] text-white/40">English Speaking Partner</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
              autoSpeak
                ? "bg-[#ff6b6b]/15 text-[#ff6b6b]"
                : "bg-white/5 text-white/40"
            }`}
            title={autoSpeak ? "Voice responses on" : "Voice responses off"}
          >
            {autoSpeak ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            )}
            {autoSpeak ? "Voice on" : "Voice off"}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("aria_api_key");
              setApiKey(null);
              setMessages([]);
            }}
            className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-white/40 hover:text-white/60 transition-colors"
          >
            Reset Key
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <VoiceVisualizer audioLevel={0} isActive={false} size={100} />
            <h2 className="text-xl font-semibold text-white mt-6 mb-2">
              Hi, I&apos;m Aria
            </h2>
            <p className="text-sm text-white/40 max-w-sm">
              Your English speaking partner. Tap the mic button and start talking.
              I&apos;ll help you improve your English through natural conversation.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {[
                "Tell me about your day",
                "Let's talk about movies",
                "Help me practice ordering food",
                "Discuss a news topic",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendToChat(suggestion)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[80%] md:max-w-[65%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#ff6b6b]/15 text-white/90 rounded-br-md"
                  : "bg-white/5 text-white/80 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingText && (
          <div className="flex justify-start animate-fade-in">
            <div className="max-w-[80%] md:max-w-[65%] px-4 py-3 rounded-2xl rounded-bl-md bg-white/5 text-white/80 text-sm leading-relaxed">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-[#ff6b6b] ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !streamingText && (
          <div className="flex justify-start animate-fade-in">
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/5">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {currentTranscript && (
          <div className="flex justify-end animate-fade-in">
            <div className="px-4 py-3 rounded-2xl rounded-br-md bg-[#ff6b6b]/10 text-white/50 text-sm italic">
              {currentTranscript}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Controls */}
      <div className="border-t border-white/5 px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          {/* Text input */}
          <form onSubmit={handleTextSubmit} className="flex-1 flex">
            <input
              type="text"
              placeholder="Type a message..."
              disabled={isProcessing}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ff6b6b]/30 transition-colors disabled:opacity-50"
            />
          </form>

          {/* Mic button */}
          <button
            onClick={handleRecordToggle}
            disabled={isProcessing && !isSpeaking}
            className={`relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? "bg-[#ff6b6b] shadow-lg shadow-[#ff6b6b]/30 scale-110"
                : isSpeaking
                  ? "bg-[#ff6b6b]/20 border-2 border-[#ff6b6b]/50"
                  : "bg-white/10 hover:bg-white/15"
            } disabled:opacity-40`}
          >
            {/* Recording visualizer ring */}
            {isRecording && (
              <div
                className="absolute inset-0 rounded-full border-2 border-[#ff6b6b] animate-ping"
                style={{ animationDuration: "1.5s" }}
              />
            )}

            {isSpeaking ? (
              // Stop icon when AI is speaking
              <svg className="w-5 h-5 text-[#ff6b6b]" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              // Mic icon
              <svg
                className={`w-5 h-5 ${isRecording ? "text-white" : "text-white/70"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-[#ff6b6b] animate-pulse" />
            <span className="text-xs text-[#ff6b6b]/80">
              Recording... tap mic to stop
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
