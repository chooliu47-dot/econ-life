"use client";

import { useEffect, useRef, useState } from "react";
import { pickEnglishVoice, warmSpeechVoices } from "@/lib/speech-synth";

type Props = {
  englishParagraphs: string[];
  /** Button label when idle */
  label?: string;
  className?: string;
};

export function PlayAudioButton({
  englishParagraphs,
  label = "Play Audio",
  className = "",
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    warmSpeechVoices();
    const warm = () => warmSpeechVoices();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warm);
      window.speechSynthesis.cancel();
    };
  }, []);

  function stop() {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPlaying(false);
  }

  function play() {
    if (!supported) return;
    const text = englishParagraphs.join("\n\n").trim();
    if (!text) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    u.pitch = 1;
    const voice = pickEnglishVoice();
    if (voice) u.voice = voice;

    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);

    utteranceRef.current = u;
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }

  if (!supported) {
    return (
      <p className="text-xs text-ink-soft">当前浏览器不支持朗读（Web Speech API）</p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (playing ? stop() : play())}
      className={`inline-flex items-center gap-2 rounded-xl bg-white/80 px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-[var(--line)] transition hover:bg-white ${className}`}
      aria-pressed={playing}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-sm ${
          playing ? "bg-warm" : "bg-accent"
        }`}
        aria-hidden
      />
      {playing ? "Stop Audio" : label}
    </button>
  );
}
