"use client";

import { useEffect, useState } from "react";
import { speakEnglishWord, warmSpeechVoices } from "@/lib/speech-synth";

type Props = {
  word: string;
  className?: string;
};

export function SpeakWordButton({ word, className = "" }: Props) {
  const [supported, setSupported] = useState(true);

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
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      title="朗读单词"
      aria-label={`朗读 ${word}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        speakEnglishWord(word, "en-US");
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition hover:bg-black/5 hover:text-accent ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M11 5 6 9H3v6h3l5 4V5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
