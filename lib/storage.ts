import type { HighScoreBlob, StoredSession } from "./types";

const SESSION_VERSION = 2;
const KEY = `gigigigichakugi.session.v${SESSION_VERSION}`;
const LEGACY_KEYS = ["gigigigichakugi.session.v1"];
const HIGHSCORE_KEY = "gigigigichakugi.highscore.v1";

const emptyHighScore: HighScoreBlob = {
  version: 1,
  highScore: 0,
  gamesPlayed: 0,
  lastScore: 0,
};

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

export function loadHighScore(): HighScoreBlob {
  if (typeof window === "undefined") return emptyHighScore;
  try {
    const raw = window.localStorage.getItem(HIGHSCORE_KEY);
    if (!raw) return emptyHighScore;
    const parsed = JSON.parse(raw) as HighScoreBlob;
    if (parsed?.version !== 1) return emptyHighScore;
    return {
      version: 1,
      highScore: Number.isFinite(parsed.highScore) ? parsed.highScore : 0,
      gamesPlayed: Number.isFinite(parsed.gamesPlayed) ? parsed.gamesPlayed : 0,
      lastScore: Number.isFinite(parsed.lastScore) ? parsed.lastScore : 0,
    };
  } catch {
    return emptyHighScore;
  }
}

export function saveHighScore(blob: HighScoreBlob): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(blob));
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
