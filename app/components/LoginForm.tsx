"use client";

import { FormEvent, useState } from "react";
import { AppLogo } from "@/app/components/AppLogo";

export function LoginForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const secretCode = String(formData.get("secretCode") || "").trim();

    if (!secretCode) {
      setError("Enter your secret code first.");
      return;
    }

    setError("");
    setIsLoading(true);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: secretCode }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setIsLoading(false);

    if (!response.ok) {
      setError(
        process.env.NODE_ENV === "production"
          ? "Could not open the chat."
          : data.error || "Could not unlock the chat.",
      );
      return;
    }

    window.sessionStorage.setItem("purplechat_unlocked", "true");
    window.location.reload();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,#f0d7ff,transparent_35%),linear-gradient(135deg,#faf5ff,#f3e8ff_45%,#ede9fe)] px-4 py-6 text-slate-950">
      <section className="w-full max-w-xs rounded-4xl border border-white/70 bg-white/85 p-5 shadow-2xl shadow-purple-300/35 backdrop-blur sm:p-6">
        <div className="mb-5 flex justify-center">
          <AppLogo size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-purple-950">
              Secret code
            </span>
            <input
              name="secretCode"
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
              onInput={(event) => setCode(event.currentTarget.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your code"
              className="h-12 w-full rounded-2xl border border-purple-100 bg-white px-4 text-base font-semibold outline-none ring-purple-400 transition focus:border-purple-300 focus:ring-4"
            />
          </label>

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="h-12 w-full rounded-2xl bg-purple-700 px-5 text-sm font-bold text-white shadow-lg shadow-purple-300 transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-purple-300"
          >
            {isLoading ? "Opening..." : "Open chat"}
          </button>
        </form>
      </section>
    </main>
  );
}
