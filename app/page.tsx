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

const OPENING_HEADLINE = "あなたは今、自分に意識があると思っていますか?";
const OPENING_BODY =
  "考えること・感じること、その全てを「意識」と呼ぶなら——それは本当に「ある」のだろうか。立場を一つだけ選んでほしい。";
const OPENING_CHOICES = [
  "意識ははっきりとある",
  "あるかもしれないが確証はない",
  "意識などないかもしれない",
];

function initialTurn(): Turn {
  return {
    headline: OPENING_HEADLINE,
    question: OPENING_BODY,
    choices: OPENING_CHOICES,
    allowFreeText: false,
  };
}

type StreamEvent =
  | { type: "headline"; text: string }
  | { type: "reply"; text: string }
  | {
      type: "done";
      headline: string;
      reply: string;
      choices: string[];
      allowFreeText: boolean;
      theme: Theme;
      retract?: { turnIndex: number };
    }
  | { type: "error"; message: string };

export default function Page() {
  const [sessionId, setSessionId] = useState<string>("");
  const [history, setHistory] = useState<TurnMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([initialTurn()]);
  const [gotchaLog, setGotchaLog] = useState<GotchaEntry[]>([]);
  const [streamingHeadline, setStreamingHeadline] = useState("");
  const [streamingReply, setStreamingReply] = useState("");
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
  }, [turns.length, streamingReply, streamingHeadline, loading]);

  const handleReset = useCallback(() => {
    if (!confirm("この対話を消去します。よろしいですか?")) return;
    clearSession();
    setSessionId(newSessionId());
    setHistory([]);
    setTurns([initialTurn()]);
    setGotchaLog([]);
    setStreamingHeadline("");
    setStreamingReply("");
    setError(null);
  }, []);

  async function submit(choice: string, freeText = false) {
    if (loading) return;
    setError(null);
    setLoading(true);
    setStreamingHeadline("");
    setStreamingReply("");

    const currentIdx = turns.length - 1;
    const currentHeadline =
      turns[currentIdx].headline ?? turns[currentIdx].question;
    const entry: GotchaEntry = {
      turnIndex: currentIdx,
      timestamp: Date.now(),
      question: currentHeadline,
      chosen: choice,
      freeText,
    };

    const nextHistory: TurnMessage[] = [
      ...history,
      {
        role: "user",
        content:
          history.length === 0
            ? `問い: ${currentHeadline}\n選択: ${choice}`
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
      let accHeadline = "";
      let accReply = "";
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
          if (ev.type === "headline") {
            accHeadline += ev.text;
            setStreamingHeadline(accHeadline);
          } else if (ev.type === "reply") {
            accReply += ev.text;
            setStreamingReply(accReply);
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
          headline: finalEvent.headline,
          question: finalEvent.reply,
          choices: finalEvent.choices,
          allowFreeText: Boolean(finalEvent.allowFreeText),
          theme: finalEvent.theme,
        },
      ]);
      if (
        finalEvent.retract &&
        Number.isInteger(finalEvent.retract.turnIndex)
      ) {
        const target = finalEvent.retract.turnIndex;
        setGotchaLog((prev) =>
          prev.map((g) =>
            g.turnIndex === target ? { ...g, retracted: true } : g,
          ),
        );
      }
      setStreamingHeadline("");
      setStreamingReply("");
    } catch (e) {
      rollback();
      setStreamingHeadline("");
      setStreamingReply("");
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }

  const current = turns[turns.length - 1];
  const past = turns.slice(0, -1);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-12 flex items-center justify-between">
        <h1 className="font-mono text-xs tracking-[0.32em] text-[color:var(--muted)]">
          戯義偽欺着魏
        </h1>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-full border border-[color:var(--border)] px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          RESET
        </button>
      </header>

      <section className="flex flex-1 flex-col gap-12">
        {past.map((t, i) => {
          const retracted = gotchaLog.some(
            (g) => g.turnIndex === i && g.retracted,
          );
          return (
            <PastTurnView key={i} index={i} turn={t} retracted={retracted} />
          );
        })}

        <article className="animate-[fadeIn_.45s_ease-out]">
          <TurnLabel index={turns.length - 1} theme={current.theme} active />

          <h2 className="mt-4 text-[26px] font-medium leading-[1.55] tracking-[-0.01em] text-[color:var(--foreground)] sm:text-[30px]">
            {current.headline ?? current.question}
          </h2>

          {current.headline && current.question && current.headline !== current.question ? (
            <p className="mt-5 text-[16px] leading-[1.85] text-[color:var(--muted)] whitespace-pre-wrap">
              {current.question}
            </p>
          ) : null}

          {loading && (streamingHeadline || streamingReply) ? (
            <div className="mt-8 border-l-2 border-[color:var(--accent)] pl-5">
              {streamingHeadline ? (
                <p className="text-[22px] font-medium leading-[1.55] text-[color:var(--foreground)] sm:text-[26px] whitespace-pre-wrap">
                  {streamingHeadline}
                  {!streamingReply ? <Caret /> : null}
                </p>
              ) : null}
              {streamingReply ? (
                <p className="mt-4 text-[16px] leading-[1.85] text-[color:var(--muted)] whitespace-pre-wrap">
                  {streamingReply}
                  <Caret />
                </p>
              ) : null}
            </div>
          ) : null}

          {!loading ? (
            <div className="mt-9 flex flex-col gap-3">
              {current.choices.map((c, i) => (
                <button
                  key={`${turns.length}-${i}`}
                  type="button"
                  onClick={() => submit(c)}
                  disabled={loading}
                  className="group flex items-center gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 text-left text-[15px] leading-[1.6] text-[color:var(--foreground)] transition hover:-translate-y-[1px] hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[16px]"
                >
                  <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)] group-hover:text-[color:var(--accent)]">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{c}</span>
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

          {loading && !streamingHeadline && !streamingReply ? (
            <p className="mt-8 font-mono text-xs tracking-[0.25em] text-[color:var(--muted)]">
              ...考えている
            </p>
          ) : null}
          {error ? (
            <p className="mt-8 text-sm text-red-500">
              エラー: {error}
              <span className="ml-2 text-[color:var(--muted)]">
                もう一度選択してください
              </span>
            </p>
          ) : null}
        </article>
        <div ref={bottomRef} />
      </section>

      <footer className="mt-16 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-[color:var(--subtle)]">
        <span>{turns.length} 問目</span>
        <span>{gotchaLog.length} 件の言質</span>
      </footer>
    </main>
  );
}

function TurnLabel({
  index,
  theme,
  active,
}: {
  index: number;
  theme?: Theme;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.25em] text-[color:var(--muted)]">
      <span>Q{String(index + 1).padStart(2, "0")}</span>
      {theme ? (
        <span
          className={`rounded-sm border px-2 py-[2px] text-[10px] ${
            active
              ? "border-[color:var(--accent)] text-[color:var(--accent)]"
              : "border-[color:var(--border)] text-[color:var(--muted)]"
          }`}
        >
          {theme}
        </span>
      ) : null}
    </div>
  );
}

function PastTurnView({
  index,
  turn,
  retracted,
}: {
  index: number;
  turn: Turn;
  retracted: boolean;
}) {
  return (
    <div className="border-l border-[color:var(--border-strong)] pl-5">
      <div className="flex items-center gap-3">
        <TurnLabel index={index} theme={turn.theme} />
        {retracted ? (
          <span className="rounded-sm border border-[color:var(--border-strong)] px-2 py-[2px] font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)]">
            撤回済
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-[18px] font-medium leading-[1.6] text-[color:var(--foreground)]/85">
        {turn.headline ?? turn.question}
      </h3>
      {turn.headline && turn.question && turn.headline !== turn.question ? (
        <details className="mt-2 text-[14px] leading-[1.85] text-[color:var(--muted)]">
          <summary className="cursor-pointer select-none font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)] hover:text-[color:var(--accent)]">
            ▸ 本文を表示
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{turn.question}</p>
        </details>
      ) : null}
      {turn.chosen ? (
        <p
          className={`mt-3 text-[14px] ${
            retracted
              ? "text-[color:var(--subtle)] line-through"
              : "text-[color:var(--muted)]"
          }`}
        >
          <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)]">
            選択 →{" "}
          </span>
          {turn.chosen}
        </p>
      ) : null}
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-[2px] inline-block h-[1.05em] w-[7px] translate-y-[3px] bg-[color:var(--accent)] [animation:caretBlink_.9s_steps(2)_infinite]" />
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
        className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[15px] outline-none transition focus:border-[color:var(--accent)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[11px] tracking-[0.2em] transition hover:border-[color:var(--accent)] disabled:opacity-50"
      >
        SEND
      </button>
    </form>
  );
}
