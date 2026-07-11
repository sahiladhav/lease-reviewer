"use client";

import { useState } from "react";

type Severity = "High" | "Medium" | "Low";

type LeaseFlag = {
  clause: string;
  severity: Severity;
  plainEnglish: string;
  whyItMatters: string;
  questionToAsk: string;
};

const DISCLAIMER =
  "This is not legal advice — it flags clauses for your review.";

const SEVERITY_STYLES: Record<Severity, string> = {
  High: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function Home() {
  const [leaseText, setLeaseText] = useState("");
  const [flags, setFlags] = useState<LeaseFlag[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReview() {
    setLoading(true);
    setError(null);
    setFlags(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong.");
      }

      setFlags(data);
    } catch {
      setError(
        "We couldn't review this lease right now. Please try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {DISCLAIMER}
        </p>

        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Lease Reviewer
        </h1>

        <textarea
          value={leaseText}
          onChange={(e) => setLeaseText(e.target.value)}
          placeholder="Paste your lease text here..."
          rows={16}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-base leading-6 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <button
          onClick={handleReview}
          disabled={loading || leaseText.trim().length === 0}
          className="w-full rounded-md bg-black px-5 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Reviewing..." : "Review my lease"}
        </button>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {flags && flags.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No clauses were flagged.
          </p>
        )}

        {flags && flags.length > 0 && (
          <div className="flex flex-col gap-4">
            {flags.map((flag, i) => (
              <div
                key={i}
                className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                    {flag.clause}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${SEVERITY_STYLES[flag.severity]}`}
                  >
                    {flag.severity}
                  </span>
                </div>
                <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="font-medium">Plain English: </span>
                  {flag.plainEnglish}
                </p>
                <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="font-medium">Why it matters: </span>
                  {flag.whyItMatters}
                </p>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="font-medium">Question to ask: </span>
                  {flag.questionToAsk}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {DISCLAIMER}
        </p>
      </main>
    </div>
  );
}
