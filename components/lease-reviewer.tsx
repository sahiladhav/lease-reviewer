"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Severity = "High" | "Medium" | "Low";

type LeaseFlag = {
  clause: string;
  severity: Severity;
  headline: string;
  plainEnglish: string;
  whyItMatters: string;
  questionToAsk: string;
};

type Status = "idle" | "loading" | "done" | "error";

const DISCLAIMER =
  "This is not legal advice — it flags clauses for your review.";

const SEVERITY_META: Record<
  Severity,
  { label: string; color: string; note: string }
> = {
  High: {
    label: "Worth a closer look",
    color: "var(--color-terracotta)",
    note: "High",
  },
  Medium: {
    label: "Good to understand",
    color: "var(--color-amber)",
    note: "Medium",
  },
  Low: {
    label: "Standard",
    color: "var(--color-sage)",
    note: "Low",
  },
};

const SEVERITY_ORDER: Severity[] = ["High", "Medium", "Low"];

const PDF_NOT_A_PDF =
  "That doesn't look like a PDF. Upload a .pdf file, or paste your lease text instead.";
const PDF_UNREADABLE =
  "We couldn't read text from this file — it may be a scanned image. Please paste your lease text instead.";
const PDF_FAILED =
  "We couldn't open this PDF. Please paste your lease text instead.";

type PdfNotice = { tone: "info" | "warn"; text: string };

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name.trim());
}

// Digital PDFs yield real text; scanned images yield little or none. Treat a
// result as usable only if there's a meaningful amount of it and it's mostly
// letters (guards against garbled extraction from image-only files).
function looksReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 60) return false;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return false;
  return letters / trimmed.length >= 0.15;
}

async function extractTextFromPdf(
  file: File
): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;

  let text = "";
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += line + "\n\n";
  }

  // Collapse the ragged spacing pdf.js produces between glyphs/lines.
  const normalized = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: normalized, pages: doc.numPages };
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// Hand-drawn-style line sketch of a row of four San Francisco "Painted
// Ladies" — thin single-weight strokes, no fill, monochrome ink.
function HeroArt({ className }: { className?: string }) {
  const houses = [
    { x: 150, apex: 78, finial: true },
    { x: 350, apex: 70, finial: false },
    { x: 550, apex: 76, finial: true },
    { x: 750, apex: 72, finial: false },
  ];

  const house = (x: number, apex: number): string[] => [
    // gabled roof + cornice
    `M${x} 128 L${x + 100} ${apex} L${x + 200} 128`,
    `M${x} 128 L${x + 200} 128`,
    // walls + floor
    `M${x} 128 L${x} 268`,
    `M${x + 200} 128 L${x + 200} 268`,
    `M${x} 268 L${x + 200} 268`,
    // belt cornice between floors
    `M${x} 202 L${x + 200} 202`,
    // two upper sash windows
    `M${x + 38} 150 L${x + 74} 150 L${x + 74} 192 L${x + 38} 192 Z`,
    `M${x + 56} 150 L${x + 56} 192`,
    `M${x + 34} 146 L${x + 78} 146`,
    `M${x + 126} 150 L${x + 162} 150 L${x + 162} 192 L${x + 126} 192 Z`,
    `M${x + 144} 150 L${x + 144} 192`,
    `M${x + 122} 146 L${x + 166} 146`,
    // arched doorway + front steps
    `M${x + 24} 258 L${x + 24} 226 Q${x + 24} 216 ${x + 34} 216 L${x + 44} 216 Q${x + 54} 216 ${x + 54} 226 L${x + 54} 258`,
    `M${x + 18} 268 L${x + 60} 268`,
    `M${x + 21} 263 L${x + 57} 263`,
    // projecting bay window with its own little roof
    `M${x + 78} 212 L${x + 86} 204 L${x + 150} 204 L${x + 158} 212`,
    `M${x + 78} 212 L${x + 78} 262`,
    `M${x + 158} 212 L${x + 158} 262`,
    `M${x + 78} 212 L${x + 158} 212`,
    `M${x + 74} 262 L${x + 162} 262`,
    `M${x + 105} 212 L${x + 105} 262`,
    `M${x + 131} 212 L${x + 131} 262`,
  ];

  return (
    <svg
      className={className}
      viewBox="0 40 1120 250"
      role="img"
      aria-label="Line sketch of four Victorian row houses"
      style={{ color: "var(--color-ink)" }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {houses.flatMap((h) =>
          house(h.x, h.apex).map((d, i) => <path key={`${h.x}-${i}`} d={d} />)
        )}
        {houses
          .filter((h) => h.finial)
          .map((h) => (
            <path
              key={`fin-${h.x}`}
              d={`M${h.x + 100} ${h.apex} L${h.x + 100} ${h.apex - 10}`}
            />
          ))}
        {houses.map((h) => (
          <circle key={`vent-${h.x}`} cx={h.x + 100} cy={h.apex + 28} r="5.5" />
        ))}
        <path d="M96 273 L1024 267" strokeOpacity="0.35" />
      </g>
    </svg>
  );
}

/* Fade-and-rise wrapper, triggered once as it scrolls into view. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      data-visible={visible}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Compact by default — clause, severity, and a one-line headline stating the
// stake — with the detail behind a toggle so a card scans in a few seconds
// and only expands what the reader cares about.
function FlagCard({ flag, index }: { flag: LeaseFlag; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[flag.severity];

  return (
    <Reveal delay={Math.min(index, 6) * 55}>
      <article
        className="flex min-h-[10.5rem] flex-col rounded-2xl border border-hairline bg-card p-5 shadow-[0_1px_2px_rgba(33,29,24,0.03)]"
        style={{ borderLeft: `3px solid ${meta.color}` }}
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
            aria-hidden
          />
          <h3 className="font-serif text-lg leading-snug text-ink">
            {flag.clause}
          </h3>
          <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {meta.note}
          </span>
        </div>

        <p className="text-[0.9375rem] leading-6 text-body">{flag.headline}</p>

        {open && (
          <dl className="mt-3 space-y-2 border-t border-hairline pt-3 text-sm leading-6">
            <div>
              <dt className="inline font-medium text-ink">In plain English. </dt>
              <dd className="inline text-body">{flag.plainEnglish}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink">Why it matters. </dt>
              <dd className="inline text-body">{flag.whyItMatters}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-ink">Question to ask. </dt>
              <dd className="inline text-body">{flag.questionToAsk}</dd>
            </div>
          </dl>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          {open ? "See less" : "See more"}
          <ChevronIcon
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
      </article>
    </Reveal>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-hairline bg-card px-6 py-16 text-center">
      {children}
    </div>
  );
}

function Analyzing() {
  return (
    <PanelShell>
      <div className="w-full max-w-[220px]">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full w-1/4 rounded-full animate-track"
            style={{ backgroundColor: "var(--color-ink)" }}
          />
        </div>
      </div>
      <p className="mt-6 font-serif text-xl text-ink">Reading your lease…</p>
      <p className="mt-1.5 text-sm text-muted">
        Going clause by clause — a few seconds.
      </p>
    </PanelShell>
  );
}

function ResultsHeader({ count }: { count: number }) {
  const headline =
    count === 0
      ? "Nothing stood out."
      : `We flagged ${count} ${count === 1 ? "item" : "items"} worth reviewing.`;
  const sub =
    count === 0
      ? "This reads like a standard lease — but give it your own read."
      : "Ordered by how much each one affects you.";

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
        {headline}
      </h2>
      <p className="mt-3 text-base text-muted">{sub}</p>
      {count > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          {SEVERITY_ORDER.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: SEVERITY_META[s].color }}
                aria-hidden
              />
              {SEVERITY_META[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeaseReviewer() {
  const [leaseText, setLeaseText] = useState("");
  const [flags, setFlags] = useState<LeaseFlag[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [pdfText, setPdfText] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<PdfNotice | null>(null);

  // What we actually send: typed text wins if present, otherwise the text
  // extracted from an uploaded PDF (which never appears in the textarea).
  const effectiveText = leaseText.trim().length > 0 ? leaseText : pdfText;
  const canReview = effectiveText.trim().length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Results sit below the input, so bring them into view on submit.
  useEffect(() => {
    if (status === "idle") return;
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, [status]);

  const handleReview = useCallback(async () => {
    const text = effectiveText;
    if (text.trim().length === 0) return;
    setStatus("loading");
    setFlags([]);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setFlags(data as LeaseFlag[]);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [effectiveText]);

  const reset = useCallback(() => {
    setStatus("idle");
    setFlags([]);
    setLeaseText("");
    setPdfText("");
    setPdfNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;

    if (!isPdfFile(file)) {
      setPdfNotice({ tone: "warn", text: PDF_NOT_A_PDF });
      return;
    }

    setPdfBusy(true);
    setPdfNotice(null);
    try {
      const { text, pages } = await extractTextFromPdf(file);
      if (!looksReadable(text)) {
        setPdfNotice({ tone: "warn", text: PDF_UNREADABLE });
        return;
      }
      setPdfText(text);
      setPdfNotice({
        tone: "info",
        text: `${file.name} loaded (${pages} ${pages === 1 ? "page" : "pages"}). Run the review to analyze it.`,
      });
    } catch {
      setPdfNotice({ tone: "warn", text: PDF_FAILED });
    } finally {
      setPdfBusy(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-canvas">
      {/* Compact hero */}
      <header className="bg-paper">
        <div className="mx-auto max-w-5xl px-6 pt-6 pb-10">
          <p className="text-center text-xs text-muted/70">{DISCLAIMER}</p>
          <h1 className="mx-auto mt-6 max-w-3xl text-center font-serif text-4xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-6xl">
            Know what you&rsquo;re signing.
          </h1>
          <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 text-left text-base text-muted sm:text-lg">
            {[
              "Paste your lease text, or upload the PDF.",
              "Get the clauses worth a closer look, in plain English.",
              "See why each one matters, with a question to ask before you sign.",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span
                  className="mt-2.5 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--color-sage)" }}
                  aria-hidden
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <HeroArt className="mx-auto mt-8 w-full max-w-2xl" />
        </div>
      </header>

      {/* Input — centered above the results */}
      <section className="mx-auto w-full max-w-2xl px-6 pt-12 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Your lease</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pdfBusy}
          >
            <UploadIcon className="size-4" />
            {pdfBusy ? "Reading PDF…" : "Upload a PDF"}
          </Button>
        </div>

        <Textarea
          value={leaseText}
          onChange={(e) => setLeaseText(e.target.value)}
          placeholder="Paste your lease here…"
          rows={10}
          aria-label="Lease text"
          className="min-h-56"
        />

        {pdfNotice && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2.5 rounded-xl border border-hairline bg-card px-4 py-3 text-sm leading-6 text-muted"
          >
            <span
              className="mt-2 size-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  pdfNotice.tone === "info"
                    ? "var(--color-sage)"
                    : "var(--color-amber)",
              }}
              aria-hidden
            />
            {pdfNotice.text}
          </p>
        )}

        <Button
          size="lg"
          onClick={handleReview}
          disabled={status === "loading" || !canReview}
          className="mt-4 w-full"
        >
          {status === "loading" ? "Reading…" : "Review my lease"}
        </Button>
      </section>

      {/* Results — full-width, three across on desktop */}
      {status !== "idle" && (
        <section
          ref={resultsRef}
          className="mx-auto w-full max-w-6xl scroll-mt-6 px-6 pt-10 pb-20"
        >
          {status === "loading" && (
            <div className="mx-auto max-w-md">
              <Analyzing />
            </div>
          )}

          {status === "error" && (
            <div className="mx-auto max-w-md">
              <PanelShell>
                <h2 className="font-serif text-xl text-ink">
                  That didn&rsquo;t go through.
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                  We couldn&rsquo;t read this lease just now — it sometimes takes
                  a second try.
                </p>
                <Button onClick={handleReview} size="sm" className="mt-6">
                  Try again
                </Button>
              </PanelShell>
            </div>
          )}

          {status === "done" && (
            <div>
              <ResultsHeader count={flags.length} />
              {flags.length > 0 && (
                <div className="mt-10 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {flags.map((flag, i) => (
                    <FlagCard key={i} flag={flag} index={i} />
                  ))}
                </div>
              )}
              <div className="mt-12 text-center">
                <Button variant="link" size="sm" onClick={reset}>
                  Review another lease
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Bottom disclaimer */}
      <footer className="border-t border-hairline">
        <p className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-muted/80">
          {DISCLAIMER}
        </p>
      </footer>
    </main>
  );
}
