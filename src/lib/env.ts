/**
 * Server-only helpers (legacy / optional).
 * Gemini now runs in the browser via NEXT_PUBLIC_GEMINI_API_KEY
 * so system proxy in China works without Node proxy config.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "" || value.startsWith("your-")) {
    return undefined;
  }
  return value.trim();
}

/** Prefer public client key; fall back to old server-only name. */
export function getGeminiApiKey(): string | null {
  return (
    read("NEXT_PUBLIC_GEMINI_API_KEY") ?? read("GEMINI_API_KEY") ?? null
  );
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() !== null;
}
