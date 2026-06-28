"use client";

import { AppLogo } from "@/app/components/AppLogo";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[linear-gradient(135deg,#faf5ff,#f3e8ff,#ede9fe)] px-5 text-purple-950">
      <section className="w-full max-w-xs rounded-4xl border border-white/70 bg-white/85 p-6 text-center shadow-2xl shadow-purple-300/35 backdrop-blur">
        <div className="mb-5 flex justify-center">
          <AppLogo size="lg" />
        </div>
        <h1 className="text-xl font-black">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Please refresh the chat and try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 h-11 w-full rounded-2xl bg-purple-700 px-5 text-sm font-bold text-white shadow-lg shadow-purple-300 transition hover:bg-purple-800"
        >
          Refresh chat
        </button>
      </section>
    </main>
  );
}
