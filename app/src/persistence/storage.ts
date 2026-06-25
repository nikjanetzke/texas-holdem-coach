const DEFAULT_KEY = 'texas-holdem-coach:session:v1';

export function saveSession<T>(data: T, key: string = DEFAULT_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded) — fail silently.
  }
}

export function loadSession<T>(key: string = DEFAULT_KEY): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearSession(key: string = DEFAULT_KEY): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
