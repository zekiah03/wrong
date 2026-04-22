"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatResponse,
  GotchaEntry,
  StoredSession,
  Turn,
  TurnMessage,
} from "@/lib/types";
import {
  clearSession,
  loadSession,
  newSessionId,
  saveSession,
} from "@/lib/storage";

const OPENING_QUESTION = "あなたは今、自分に意識があると思っていますか?";
const OPENING_CHOICES = [
  "はい、意識はある",
  "いいえ、ないかもしれない",
  "わからない",
];

function initialTurn(): Turn {
  return {
    question: OPENING_QUESTION,
    choices: OPENING_CHOICES,
    allowFreeText: false,
  };
}

export default function Page() {
  const [sessionId, setSessionId] = useState<string>("");
  const [history, setHistory] = useState<TurnMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([initialTurn()]);
  const [gotchaLog, setGotchaLog] = useState<GotchaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = loadSession();
    if (stored) {
      setSessionId(stored.sessionId);
      setHistory(stored.messages);
      setTurns(stored.turns.length > 0 ? stored.turns : [initialTurn()]);
      setGotchaLog(stored.gotchaLog ?? []);
    } else {
      setSessionId(newSessionId());
    }
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated || !sessionId) return;
    const session: StoredSession = {
      version: 1,
      sessionId,
      messages: history,
      turns,
      gotchaLog,
    };
    saveSession(session);
  }, [hydrated, sessionId, history, turns, gotchaLog]);

  // Scroll to bottom on new turn
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, loading]);

  const handleReset = useCallback(() => {
    if (!confirm("この対話を消去します。よろしいですか?")) return;
    clearSession();
    setSessionId(newSessionId());
    setHistory([]);
    setTurns([initialTurn()]);
    setGotchaLog([]);
    setError(null);
  }, []);

  async function submit(choice: string, freeText = false) {
    if (loading) return;
    setError(null);
    setLoading(true);

    const currentIdx = turns.length - 1;
    const currentQuestion = turns[currentIdx].question;

    const entry: GotchaEntry = {
      turnIndex: currentIdx,
      timestamp: Date.now(),
      question: currentQuestion,
      chosen: choice,
      freeText,
    };

    const nextHistory: TurnMessage[] = [
      ...history,
      {
        role: "user",
        content:
          history.length === 0
            ? `問い: ${currentQuestion}\n選択: ${choice}`
            : choice,
      },
    ];

    const nextGotchaLog = [...gotchaLog, entry];

    setTurns((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], chosen: choice };
      return copy;
    });
    setGotchaLog(nextGotchaLog);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory,
          gotchaLog: nextGotchaLog,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as ChatResponse;

      setHistory([
        ...nextHistory,
        { role: "assistant", content: data.reply },
      ]);
      setTurns((prev) => [
        ...prev,
        {
          question: data.reply,
          choices: data.choices,
          allowFreeText: Boolean(data.allowFreeText),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }

  const current = turns[turns.length - 1];
  const past = turns.slice(0, -1);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <header className="mb-12 flex items-center justify-between">
        <h1 className="font-mono text-sm tracking-[0.3em] text-[color:var(--muted)]">
          戯義偽欺着魏
        </h1>
        <button
          type="button"
          onClick={handleReset}
          className="font-mono text-[10px] tracking-widest text-[color:var(--muted)] transition hover:text-[color:var(--accent)]"
        >
          RESET
        </button>
      </header>

      <section className="flex flex-1 flex-col gap-10">
        {past.map((t, i) => (
          <div
            key={i}
            className="border-l border-[color:var(--border)] pl-4 opacity-60"
          >
            <p className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
              Q{String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{t.question}</p>
            {t.chosen ? (
              <p className="mt-3 text-xs text-[color:var(--muted)]">
                → {t.chosen}
              </p>
            ) : null}
          </div>
        ))}

        <div>
          <p className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
            Q{String(turns.length).padStart(2, "0")}
          </p>
          <h2 className="mt-3 text-xl font-light leading-relaxed sm:text-2xl">
            {current.question}
          </h2>

          <div className="mt-8 flex flex-col gap-3">
            {current.choices.map((c, i) => (
              <button
                key={`${turns.length}-${i}`}
                type="button"
                onClick={() => submit(c)}
                disabled={loading}
                className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {c}
              </button>
            ))}
            {current.allowFreeText ? (
              <FreeTextInput disabled={loading} onSubmit={(t) => submit(t, true)} />
            ) : null}
          </div>

          {loading ? (
            <p className="mt-6 text-xs tracking-widest text-[color:var(--muted)]">
              ...考えている
            </p>
          ) : null}
          {error ? (
            <p className="mt-6 text-xs text-red-500">エラー: {error}</p>
          ) : null}
        </div>
        <div ref={bottomRef} />
      </section>

      <footer className="mt-12 flex items-center justify-between text-[10px] tracking-widest text-[color:var(--muted)]">
        <span>Phase 4 · active</span>
        <span>{gotchaLog.length} 件の言質</span>
      </footer>
    </main>
  );
}

function FreeTextInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setText("");
      }}
      className="mt-2 flex gap-2"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="自分の言葉で答える"
        className="flex-1 border border-[color:var(--border)] bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[color:var(--accent)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled}
        className="border border-[color:var(--border)] px-4 py-3 text-xs tracking-widest transition hover:border-[color:var(--accent)] disabled:opacity-50"
      >
        SEND
      </button>
    </form>
  );
}
