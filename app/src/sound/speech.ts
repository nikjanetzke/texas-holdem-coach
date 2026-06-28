// Thin wrapper around the browser's built-in Web Speech API (free, no assets).
// Quality depends on the device's installed voices.
let enabled = false;

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function setSpeechEnabled(value: boolean) {
  enabled = value;
  if (!value && speechSupported()) window.speechSynthesis.cancel();
}

export function isSpeechEnabled(): boolean {
  return enabled;
}

export function speak(text: string) {
  if (!enabled || !speechSupported() || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  u.volume = 1;
  // Cancel anything mid-sentence so advice doesn't pile up.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
