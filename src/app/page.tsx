"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useVoice, speak, stopSpeaking } from "@/lib/useVoice";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function ApiKeyModal({ onSave }: { onSave: (key: string) => void }) {
  const [key, setKey] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Welcome to Aria</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Enter your Google Gemini API key to start.<br />
            Get a free key at{" "}
            <span className="text-[#ff6b6b]/80">aistudio.google.com</span>
          </p>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza..."
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
        <p className="text-[11px] text-white/30 text-center mt-3">
          100% free &middot; Key stored only in your browser
        </p>
      </div>
    </div>
  );
}

export default function SpeakingPartner() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendToChat = useCallback(
    async (userText: string) => {
      if (!apiKey) return;

      const userMessage: Message = { role: "user", content: userText };
      const updated = [...messagesRef.current, userMessage];
      setMessages(updated);
      messagesRef.current = updated;
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
            messages: updated.map((m) => ({ role: m.role, content: m.content })),
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
                  // skip
                }
              }
            }
          }
        }

        const assistantMsg: Message = { role: "assistant", content: fullText };
        setMessages((prev) => [...prev, assistantMsg]);
        messagesRef.current = [...updated, assistantMsg];
        setStreamingText("");
        setIsProcessing(false);

        if (autoSpeak && fullText) {
          speak(
            fullText,
            () => setIsSpeaking(true),
            () => setIsSpeaking(false)
          );
        }
      } catch (err) {
        console.error("Chat error:", err);
        setIsProcessing(false);
        setStreamingText("");
      }
    },
    [apiKey, autoSpeak]
  );

  const { isListening, interimText, startListening, stopListening } =
    useVoice(sendToChat);

  useEffect(() => {
    const stored = localStorage.getItem("aria_api_key");
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, interimText]);

  useEffect(() => {
    speechSynthesis.getVoices();
    const handler = () => speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", handler);
    return () => speechSynthesis.removeEventListener("voiceschanged", handler);
  }, []);

  const saveApiKey = (key: string) => {
    localStorage.setItem("aria_api_key", key);
    setApiKey(key);
  };

  const handleMicToggle = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.querySelector("input") as HTMLInputElement;
    const text = input.value.trim();
    if (!text || isProcessing) return;
    input.value = "";
    sendToChat(text);
  };

  if (!apiKey) return <ApiKeyModal onSave={saveApiKey} />;

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
              autoSpeak ? "bg-[#ff6b6b]/15 text-[#ff6b6b]" : "bg-white/5 text-white/40"
            }`}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-20 h-20 bg-gradient-to-br from-[#ff6b6b]/20 to-[#ee5a24]/20 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-[#ff6b6b]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Hi, I&apos;m Aria</h2>
            <p className="text-sm text-white/40 max-w-sm leading-relaxed">
              Your English speaking partner. Tap the mic and start talking,
              or type a message below.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {["Tell me about your day", "Let's talk about movies", "Practice ordering food", "Discuss a news topic"].map((s) => (
                <button
                  key={s}
                  onClick={() => sendToChat(s)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <span className="text-white text-[10px] font-bold">A</span>
              </div>
            )}
            <div className={`max-w-[80%] md:max-w-[65%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-[#ff6b6b]/15 text-white/90 rounded-br-md"
                : "bg-white/[0.06] text-white/80 rounded-bl-md"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] flex items-center justify-center flex-shrink-0 mr-2 mt-1">
              <span className="text-white text-[10px] font-bold">A</span>
            </div>
            <div className="max-w-[80%] md:max-w-[65%] px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.06] text-white/80 text-sm leading-relaxed">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-[#ff6b6b] ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {isProcessing && !streamingText && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ff6b6b] to-[#ee5a24] flex items-center justify-center flex-shrink-0 mr-2 mt-1">
              <span className="text-white text-[10px] font-bold">A</span>
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.06]">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#ff6b6b]/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {interimText && (
          <div className="flex justify-end animate-fade-in">
            <div className="px-4 py-3 rounded-2xl rounded-br-md bg-[#ff6b6b]/10 text-white/50 text-sm italic">
              {interimText}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Controls */}
      <div className="border-t border-white/5 px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <form onSubmit={handleTextSubmit} className="flex-1 flex">
            <input
              type="text"
              placeholder="Type a message..."
              disabled={isProcessing}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ff6b6b]/30 transition-colors disabled:opacity-50"
            />
          </form>

          <button
            onClick={handleMicToggle}
            disabled={isProcessing && !isSpeaking}
            className={`relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-[#ff6b6b] shadow-lg shadow-[#ff6b6b]/30 scale-110"
                : isSpeaking
                  ? "bg-[#ff6b6b]/20 border-2 border-[#ff6b6b]/50"
                  : "bg-white/10 hover:bg-white/15"
            } disabled:opacity-40`}
          >
            {isListening && (
              <div className="absolute inset-0 rounded-full border-2 border-[#ff6b6b] animate-ping" style={{ animationDuration: "1.5s" }} />
            )}
            {isSpeaking ? (
              <svg className="w-5 h-5 text-[#ff6b6b]" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className={`w-5 h-5 ${isListening ? "text-white" : "text-white/70"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            )}
          </button>
        </div>

        {isListening && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-[#ff6b6b] animate-pulse" />
            <span className="text-xs text-[#ff6b6b]/80">Listening... tap mic to send</span>
          </div>
        )}
        {isSpeaking && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="flex gap-0.5 items-end h-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-0.5 bg-[#ff6b6b]/60 rounded-full animate-pulse"
                  style={{ height: `${6 + (i % 3) * 3}px`, animationDelay: `${i * 100}ms`, animationDuration: "0.6s" }} />
              ))}
            </div>
            <span className="text-xs text-white/40">Aria is speaking... tap to stop</span>
          </div>
        )}
      </div>
    </div>
  );
}
