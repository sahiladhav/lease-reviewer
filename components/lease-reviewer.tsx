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

// Editorial line-art arcade — soft, architectural, not a stock photo.
function HeroArt({ className }: { className?: string }) {
  const columns = [140, 308, 476, 644, 812, 980];
  const springY = 150;
  const baseY = 224;
  const r = 84;
  return (
    <svg
      className={className}
      viewBox="0 0 1120 260"
      role="img"
      aria-label="Illustration of an arched colonnade"
      style={{ color: "var(--color-ink)" }}
    >
      <circle cx="560" cy="116" r="140" fill="var(--color-sage)" opacity="0.07" />
      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        {columns.slice(0, -1).map((x) => (
          <path key={`arch-${x}`} d={`M${x} ${springY} A${r} ${r} 0 0 1 ${x + 168} ${springY}`} />
        ))}
        {columns.map((x) => (
          <path key={`col-${x}`} d={`M${x} ${springY} L${x} ${baseY}`} />
        ))}
        <path d={`M104 ${baseY} L1016 ${baseY}`} />
        <path d="M88 238 L1032 238" strokeOpacity="0.25" />
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

// Condensed, scannable flag: title + severity dot up top, three short lines.
function FlagCard({ flag, index }: { flag: LeaseFlag; index: number }) {
  const meta = SEVERITY_META[flag.severity];
  return (
    <Reveal delay={Math.min(index, 6) * 55} className="h-full">
      <article
        className="flex h-full flex-col rounded-2xl border border-hairline bg-card p-5 shadow-[0_1px_2px_rgba(33,29,24,0.03)]"
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
        <dl className="space-y-1.5 text-sm leading-6">
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
                <div className="mt-10 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
