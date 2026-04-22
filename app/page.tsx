"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GotchaEntry,
  StoredSession,
  Theme,
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

type StreamEvent =
  | { type: "reply"; text: string }
  | {
      type: "done";
      reply: string;
      choices: string[];
      allowFreeText: boolean;
      theme: Theme;
    }
  | { type: "error"; message: string };

export default function Page() {
  const [sessionId, setSessionId] = useState<string>("");
  const [history, setHistory] = useState<TurnMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([initialTurn()]);
  const [gotchaLog, setGotchaLog] = useState<GotchaEntry[]>([]);
  const [streamingText, setStreamingText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, streamingText, loading]);

  const handleReset = useCallback(() => {
    if (!confirm("この対話を消去します。よろしいですか?")) return;
    clearSession();
    setSessionId(newSessionId());
    setHistory([]);
    setTurns([initialTurn()]);
    setGotchaLog([]);
    setStreamingText("");
    setError(null);
  }, []);

  async function submit(choice: string, freeText = false) {
    if (loading) return;
    setError(null);
    setLoading(true);
    setStreamingText("");

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

    // Optimistic update
    setTurns((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], chosen: choice };
      return copy;
    });
    setGotchaLog(nextGotchaLog);

    const rollback = () => {
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          chosen: undefined,
        };
        return copy;
      });
      setGotchaLog(gotchaLog);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory,
          gotchaLog: nextGotchaLog,
        }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finalEvent:
        | Extract<StreamEvent, { type: "done" }>
        | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "reply") {
            acc += ev.text;
            setStreamingText(acc);
          } else if (ev.type === "done") {
            finalEvent = ev;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }

      if (!finalEvent) throw new Error("不完全な応答");

      setHistory([
        ...nextHistory,
        { role: "assistant", content: finalEvent.reply },
      ]);
      setTurns((prev) => [
        ...prev,
        {
          question: finalEvent.reply,
          choices: finalEvent.choices,
          allowFreeText: Boolean(finalEvent.allowFreeText),
          theme: finalEvent.theme,
        },
      ]);
      setStreamingText("");
    } catch (e) {
      rollback();
      setStreamingText("");
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
            className="border-l border-[color:var(--border)] pl-4 opacity-60 transition-opacity"
          >
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
              <span>Q{String(i + 1).padStart(2, "0")}</span>
              {t.theme ? (
                <span className="border border-[color:var(--border)] px-2 py-[1px] font-mono text-[9px] tracking-widest">
                  {t.theme}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
              {t.question}
            </p>
            {t.chosen ? (
              <p className="mt-3 text-xs text-[color:var(--muted)]">
                → {t.chosen}
              </p>
            ) : null}
          </div>
        ))}

        <div className="animate-[fadeIn_.4s_ease-out]">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
            <span>Q{String(turns.length).padStart(2, "0")}</span>
            {current.theme ? (
              <span className="border border-[color:var(--accent)] px-2 py-[1px] font-mono text-[9px] tracking-widest text-[color:var(--accent)]">
                {current.theme}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-xl font-light leading-relaxed sm:text-2xl whitespace-pre-wrap">
            {current.question}
          </h2>

          {loading && streamingText ? (
            <div className="mt-6 border-l border-[color:var(--accent)] pl-4 text-base leading-relaxed whitespace-pre-wrap">
              {streamingText}
              <span className="ml-[2px] inline-block h-[1em] w-[6px] translate-y-[2px] animate-pulse bg-[color:var(--accent)]" />
            </div>
          ) : null}

          {!loading ? (
            <div className="mt-8 flex flex-col gap-3">
              {current.choices.map((c, i) => (
                <button
                  key={`${turns.length}-${i}`}
                  type="button"
                  onClick={() => submit(c)}
                  disabled={loading}
                  className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] hover:translate-x-[2px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
              {current.allowFreeText ? (
                <FreeTextInput
                  disabled={loading}
                  onSubmit={(t) => submit(t, true)}
                />
              ) : null}
            </div>
          ) : null}

          {loading && !streamingText ? (
            <p className="mt-6 text-xs tracking-widest text-[color:var(--muted)]">
              ...考えている
            </p>
          ) : null}
          {error ? (
            <p className="mt-6 text-xs text-red-500">
              エラー: {error}
              <span className="ml-2 text-[color:var(--muted)]">
                (もう一度選択してください)
              </span>
            </p>
          ) : null}
        </div>
        <div ref={bottomRef} />
      </section>

      <footer className="mt-12 flex items-center justify-between text-[10px] tracking-widest text-[color:var(--muted)]">
        <span>Phase 6 · live</span>
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
