"use client";

import { useState } from "react";
import type { ChatResponse, TurnMessage } from "@/lib/types";

const OPENING_QUESTION = "あなたは今、自分に意識があると思っていますか?";
const OPENING_CHOICES = [
  "はい、意識はある",
  "いいえ、ないかもしれない",
  "わからない",
];

type Turn = {
  question: string;
  choices: string[];
  allowFreeText: boolean;
  chosen?: string;
};

export default function Page() {
  const [history, setHistory] = useState<TurnMessage[]>([]);
  const [turns, setTurns] = useState<Turn[]>([
    {
      question: OPENING_QUESTION,
      choices: OPENING_CHOICES,
      allowFreeText: false,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(choice: string) {
    setError(null);
    setLoading(true);

    const nextHistory: TurnMessage[] = [
      ...history,
      { role: "user", content: choice },
    ];

    // mark the current turn's choice locally
    setTurns((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], chosen: choice };
      return copy;
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages:
            nextHistory.length === 1
              ? [
                  {
                    role: "user",
                    content: `問い: ${OPENING_QUESTION}\n選択: ${choice}`,
                  },
                ]
              : nextHistory,
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
      <header className="mb-12">
        <h1 className="font-mono text-sm tracking-[0.3em] text-[color:var(--muted)]">
          戯義偽欺着魏
        </h1>
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
                key={i}
                type="button"
                onClick={() => submit(c)}
                disabled={loading}
                className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {c}
              </button>
            ))}
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
      </section>

      <footer className="mt-12 text-[10px] tracking-widest text-[color:var(--muted)]">
        Phase 2 · API connected
      </footer>
    </main>
  );
}
