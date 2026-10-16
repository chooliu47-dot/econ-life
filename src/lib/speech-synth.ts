/** Shared Web Speech helpers (en-US / en-GB). */

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        /Google|Samantha|Daniel|Karen|Moira|Alex|Microsoft/i.test(v.name),
    ) ??
    voices.find((v) => v.lang.startsWith("en-US") || v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

export function warmSpeechVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
}

/** Speak a single English word/phrase only — never full paragraphs. */
export function speakEnglishWord(word: string, lang: "en-US" | "en-GB" = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const text = word.trim();
  if (!text) return;

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.88;
  u.pitch = 1;
  const voice = pickEnglishVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}
