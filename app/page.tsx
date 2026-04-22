export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <header className="mb-12">
        <h1 className="font-mono text-sm tracking-[0.3em] text-[color:var(--muted)]">
          戯義偽欺着魏
        </h1>
      </header>

      <section className="flex flex-1 flex-col justify-center">
        <p className="text-xs uppercase tracking-widest text-[color:var(--muted)]">
          Question 01
        </p>
        <h2 className="mt-4 text-2xl font-light leading-relaxed sm:text-3xl">
          あなたは今、自分に意識があると思っていますか?
        </h2>

        <div className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            disabled
            className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            はい、意識はある
          </button>
          <button
            type="button"
            disabled
            className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            いいえ、ないかもしれない
          </button>
          <button
            type="button"
            disabled
            className="border border-[color:var(--border)] px-5 py-4 text-left text-sm transition hover:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            わからない
          </button>
        </div>
      </section>

      <footer className="mt-12 text-[10px] tracking-widest text-[color:var(--muted)]">
        Phase 1 · UI skeleton
      </footer>
    </main>
  );
}
