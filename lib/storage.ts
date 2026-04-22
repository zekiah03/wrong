import type { StoredSession } from "./types";

const SESSION_VERSION = 2;
const KEY = `gigigigichakugi.session.v${SESSION_VERSION}`;
const LEGACY_KEYS = ["gigigigichakugi.session.v1"];

function clearLegacyKeys() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  clearLegacyKeys();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.version !== SESSION_VERSION) return null;
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.turns)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // quota or privacy mode: ignore
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  clearLegacyKeys();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function newSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
