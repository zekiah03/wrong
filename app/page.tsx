"use client";

import type { CSSProperties, FC } from "react";
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

const OPENING_HEADLINE = "やっほー！ぼく、ぎぃちゃん。";
const OPENING_BODY =
  "はじめましてだね。ぼくはぎぃちゃん。きみとおしゃべりしながら、こたえのない問いをいっしょに考えるあそびをするよ。\nまずはゆる〜く、じぶんのことから教えて。\n\nきみ、いまどんな気分？";
const OPENING_CHOICES = [
  "まあまあ元気かな",
  "なんか、もやもやしてる",
  "ふつう。とくになんにも",
  "じぶんでもよくわかんない",
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
    if (!confirm("このおしゃべり、ぜんぶ消しちゃう？")) return;
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

      if (!finalEvent) throw new Error("とちゅうで返事がとぎれたよ");

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
    <main className="relative mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8 sm:py-14">
      <Decorations />
      <header className="relative z-10 mb-12 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div className="flex flex-col">
            <span className="font-mono text-xs tracking-[0.32em] text-[color:var(--muted)]">
              戯義偽欺着魏
            </span>
            <span className="mt-0.5 text-[11px] tracking-[0.05em] text-[color:var(--subtle)]">
              ぎぃちゃんと、おしゃべり。
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="group mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--muted)] transition hover:-translate-y-[1px] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:shadow-soft active:scale-95"
        >
          <IconRefresh className="h-3 w-3 transition group-hover:rotate-[-90deg]" />
          RESET
        </button>
      </header>

      <section className="relative z-10 flex flex-1 flex-col gap-12">
        {past.map((t, i) => {
          const retracted = gotchaLog.some(
            (g) => g.turnIndex === i && g.retracted,
          );
          return (
            <PastTurnView key={i} index={i} turn={t} retracted={retracted} />
          );
        })}

        <article className="rounded-squish border border-[color:var(--border)] bg-[color:var(--surface)]/70 p-6 shadow-soft backdrop-blur-sm [animation:popIn_.55s_cubic-bezier(.2,.9,.3,1.2)] sm:p-8">
          <TurnLabel index={turns.length - 1} theme={current.theme} active />

          <h2 className="mt-4 text-[26px] font-semibold leading-[1.55] tracking-[-0.005em] text-[color:var(--foreground)] sm:text-[30px]">
            {current.headline ?? current.question}
          </h2>

          {current.headline && current.question && current.headline !== current.question ? (
            <p className="mt-5 text-[16px] leading-[1.85] text-[color:var(--muted)] whitespace-pre-wrap">
              {current.question}
            </p>
          ) : null}

          {loading && (streamingHeadline || streamingReply) ? (
            <div className="mt-8 rounded-squish bg-[color:var(--accent-soft)]/60 p-5 ring-1 ring-[color:var(--accent)]/30">
              {streamingHeadline ? (
                <p className="text-[22px] font-semibold leading-[1.55] text-[color:var(--foreground)] sm:text-[26px] whitespace-pre-wrap">
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
                  style={{
                    animation: `popIn .5s cubic-bezier(.2,.9,.3,1.2) ${0.08 * i + 0.1}s both`,
                  }}
                  className="group flex items-center gap-3 rounded-squish border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 text-left text-[15px] leading-[1.6] text-[color:var(--foreground)] shadow-soft transition hover:-translate-y-[2px] hover:border-[color:var(--accent)] hover:shadow-[0_12px_26px_-12px_rgba(255,122,182,0.55)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[16px]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] font-mono text-[11px] tracking-[0.05em] text-[color:var(--accent)] transition group-hover:scale-110 group-hover:bg-[color:var(--accent)] group-hover:text-[color:var(--accent-ink)]">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{c}</span>
                  <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--subtle)] transition group-hover:translate-x-1 group-hover:text-[color:var(--accent)]" />
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
            <p className="mt-8 inline-flex items-center gap-2 font-mono text-xs tracking-[0.25em] text-[color:var(--muted)]">
              <BouncingDots />
              かんがえちゅう
            </p>
          ) : null}
          {error ? (
            <div className="mt-8 rounded-squish border border-red-300/60 bg-red-50/70 px-4 py-3 text-sm text-red-500 dark:border-red-400/30 dark:bg-red-500/10">
              <p className="font-medium">あれ、うまくいかなかった</p>
              <p className="mt-1 text-xs opacity-80">{error}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">もういっかいえらんでみて</p>
            </div>
          ) : null}
        </article>
        <div ref={bottomRef} />
      </section>

      <footer className="relative z-10 mt-16 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-[color:var(--subtle)]">
        <span className="inline-flex items-center gap-1.5">
          <IconStar className="h-3 w-3 text-[color:var(--accent)]" />
          {turns.length} もんめ
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconHeart className="h-3 w-3 text-[color:var(--accent)]" />
          {gotchaLog.length} こ言質ゲット
        </span>
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
    <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-[color:var(--muted)]">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] ${
          active
            ? "bg-[color:var(--accent)] text-[color:var(--accent-ink)]"
            : "bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
        }`}
      >
        <IconBubble className="h-2.5 w-2.5" />
        Q{String(index + 1).padStart(2, "0")}
      </span>
      {theme ? (
        <span
          className={`rounded-full border px-2 py-[2px] text-[10px] ${
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
    <div className="relative rounded-squish border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface)]/40 pl-5 pr-4 py-4">
      <div className="flex items-center gap-3">
        <TurnLabel index={index} theme={turn.theme} />
        {retracted ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-2 py-[2px] font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)]">
            <IconCross className="h-2.5 w-2.5" />
            とり消し
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-[18px] font-medium leading-[1.6] text-[color:var(--foreground)]/85">
        {turn.headline ?? turn.question}
      </h3>
      {turn.headline && turn.question && turn.headline !== turn.question ? (
        <details className="group mt-2 text-[14px] leading-[1.85] text-[color:var(--muted)]">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)] hover:text-[color:var(--accent)] [&::-webkit-details-marker]:hidden">
            <IconChevron className="h-3 w-3 transition group-open:rotate-90" />
            ぜんぶ見る
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{turn.question}</p>
        </details>
      ) : null}
      {turn.chosen ? (
        <p
          className={`mt-3 inline-flex items-center gap-1.5 text-[14px] ${
            retracted
              ? "text-[color:var(--subtle)] line-through"
              : "text-[color:var(--muted)]"
          }`}
        >
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] text-[color:var(--subtle)]">
            えらんだ
            <IconArrowRight className="h-3 w-3" />
          </span>
          {turn.chosen}
        </p>
      ) : null}
    </div>
  );
}

function Caret() {
  return (
    <span className="ml-[3px] inline-block h-[1em] w-[8px] translate-y-[2px] rounded-full bg-[color:var(--accent)] [animation:caretBlink_.9s_steps(2)_infinite]" />
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
        placeholder="じぶんの言葉で答える"
        className="flex-1 rounded-squish border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[15px] outline-none transition focus:border-[color:var(--accent)] focus:shadow-soft disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled}
        aria-label="おくる"
        className="group inline-flex items-center gap-1.5 rounded-squish border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[11px] tracking-[0.2em] transition hover:-translate-y-[1px] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:shadow-soft active:scale-95 disabled:opacity-50"
      >
        <IconPaperPlane className="h-3.5 w-3.5 transition group-hover:[animation:takeoff_.35s_ease-out_forwards]" />
        おくる
      </button>
    </form>
  );
}

/* ─── SVGアイコン・装飾 ─── */

function LogoMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className="h-7 w-7 shrink-0 [animation:floaty_4s_ease-in-out_infinite]"
    >
      <circle cx="10" cy="22" r="5" fill="var(--accent-soft)" />
      <circle cx="21" cy="12" r="6" fill="var(--accent)" />
      <circle cx="21" cy="12" r="2" fill="var(--accent-ink)" opacity="0.9" />
      <path
        d="M26 20 L27 23.5 L30.5 24.5 L27 25.5 L26 29 L25 25.5 L21.5 24.5 L25 23.5 Z"
        fill="var(--accent)"
        opacity="0.85"
      />
    </svg>
  );
}

type IconProps = { className?: string; style?: CSSProperties };

function IconStar({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} style={style}>
      <path
        d="M10 1.5 L11.6 8.4 L18.5 10 L11.6 11.6 L10 18.5 L8.4 11.6 L1.5 10 L8.4 8.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconHeart({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} style={style}>
      <path
        d="M10 17.2 C10 17.2 2 11.6 2 6.9 C2 4.2 4 2.2 6.5 2.2 C8.2 2.2 9.4 3.1 10 4.2 C10.6 3.1 11.8 2.2 13.5 2.2 C16 2.2 18 4.2 18 6.9 C18 11.6 10 17.2 10 17.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconBubble({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} style={style}>
      <circle cx="10" cy="10" r="7.5" fill="currentColor" />
      <circle cx="7" cy="7" r="2.2" fill="var(--surface)" opacity="0.75" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={className}>
      <path
        d="M4 2 L8 6 L4 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path
        d="M2.5 8 H13.5 M9 3.5 L13.5 8 L9 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IconPaperPlane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={className}>
      <path d="M16.2 1.8 L1 8.6 L6.8 10.6 L9.1 16.2 L16.2 1.8 Z" fill="currentColor" />
      <path
        d="M6.8 10.6 L16.2 1.8"
        stroke="var(--surface)"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path
        d="M13 8 A5 5 0 1 1 11.5 4.5 M13.5 2 L13.5 5 L10.5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IconCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden className={className}>
      <path
        d="M2 2 L8 8 M8 2 L2 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BouncingDots() {
  return (
    <span className="inline-flex items-end gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-[6px] w-[6px] rounded-full bg-[color:var(--accent)] [animation:floaty_1s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}

/**
 * 背景にふわっと浮くSVG装飾。pointer-events-noneなのでクリックは素通り。
 */
function Decorations() {
  const items: Array<{
    Cmp: FC<{ className?: string; style?: CSSProperties }>;
    cls: string;
    delay: string;
    dur: string;
  }> = [
    { Cmp: IconStar, cls: "top-[6%] left-[4%] h-4 w-4", delay: "0s", dur: "3.8s" },
    { Cmp: IconHeart, cls: "top-[18%] right-[5%] h-3 w-3", delay: "-1s", dur: "4.2s" },
    { Cmp: IconBubble, cls: "top-[42%] left-[2%] h-3 w-3", delay: "-1.6s", dur: "5s" },
    { Cmp: IconBubble, cls: "bottom-[22%] right-[4%] h-5 w-5", delay: "-0.5s", dur: "4.6s" },
    { Cmp: IconStar, cls: "bottom-[8%] left-[8%] h-3 w-3", delay: "-2.1s", dur: "3.4s" },
    { Cmp: IconHeart, cls: "bottom-[14%] right-[14%] h-2.5 w-2.5", delay: "-0.8s", dur: "4s" },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {items.map(({ Cmp, cls, delay, dur }, i) => (
        <Cmp
          key={i}
          className={`absolute text-[color:var(--accent-soft)] ${cls}`}
          style={{
            animation: `floaty ${dur} ease-in-out ${delay} infinite`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,_var(--accent-soft)_0%,_transparent_70%)] opacity-40" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-[radial-gradient(ellipse_at_bottom,_var(--accent-soft)_0%,_transparent_70%)] opacity-30" />
    </div>
  );
}
