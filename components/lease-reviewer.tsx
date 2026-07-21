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
  "That doesn't look like a PDF. Upload a .pdf file, or paste your lease text below.";
const PDF_UNREADABLE =
  "We couldn't read text from this file — it may be a scanned image. Please paste your lease text instead.";
const PDF_FAILED =
  "We couldn't open this PDF. Please paste your lease text instead.";

type PdfNotice = { tone: "info" | "warn"; text: string };

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || /\.pdf$/i.test(file.name.trim())
  );
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

  // Collapse the ragged spacing pdf.js produces between glyphs/lines so the
  // text is readable in the textarea before the user submits it.
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
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
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

function SeverityTag({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

function FlagField({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="text-[1.0625rem] leading-8 text-body">{children}</p>
    </div>
  );
}

function FlagCard({ flag, index }: { flag: LeaseFlag; index: number }) {
  const meta = SEVERITY_META[flag.severity];
  return (
    <Reveal delay={Math.min(index, 5) * 70}>
      <article
        className="rounded-3xl border border-hairline bg-card p-8 shadow-[0_1px_2px_rgba(33,29,24,0.03)] sm:p-10"
        style={{ borderLeft: `3px solid ${meta.color}` }}
      >
        <header className="mb-6 flex flex-col gap-3 border-b border-hairline pb-6">
          <SeverityTag severity={flag.severity} />
          <h3 className="font-serif text-2xl leading-tight text-ink sm:text-[1.75rem]">
            {flag.clause}
          </h3>
        </header>
        <div className="flex flex-col gap-6">
          <FlagField label="In plain English">{flag.plainEnglish}</FlagField>
          <FlagField label="Why it matters to you">
            {flag.whyItMatters}
          </FlagField>
          <FlagField label="A question to ask">{flag.questionToAsk}</FlagField>
        </div>
      </article>
    </Reveal>
  );
}

function Analyzing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-xs">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full w-1/4 rounded-full animate-track"
            style={{ backgroundColor: "var(--color-ink)" }}
          />
        </div>
      </div>
      <p className="mt-8 font-serif text-2xl text-ink">Reading your lease…</p>
      <p className="mt-2 text-sm text-muted">
        Going clause by clause. This usually takes a few seconds.
      </p>
    </div>
  );
}

function ResultsHeader({ count }: { count: number }) {
  const headline =
    count === 0
      ? "Nothing stood out."
      : `We flagged ${count} ${count === 1 ? "item" : "items"} worth reviewing.`;
  const sub =
    count === 0
      ? "This reads like a fairly standard lease. Give it your own read-through, but nothing here raised a flag."
      : "Most leases are mostly standard. Here's what's worth a moment of your attention, ordered by how much it affects you.";

  return (
    <div className="mx-auto max-w-2xl px-6 text-center">
      <Reveal>
        <h2 className="font-serif text-4xl leading-[1.1] text-ink sm:text-5xl">
          {headline}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-muted">
          {sub}
        </p>
      </Reveal>
      {count > 0 && (
        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {SEVERITY_ORDER.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted"
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
        </Reveal>
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

  const heroRef = useRef<HTMLElement>(null);
  const outputRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollTo = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, []);

  // Scroll to the output region once it has actually mounted for the new
  // status — reading the ref synchronously in the handler would see null,
  // since the section only renders after the state update commits.
  useEffect(() => {
    if (status === "loading" || status === "done" || status === "error") {
      scrollTo(outputRef.current);
    }
  }, [status, scrollTo]);

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
    setPdfText("");
    setPdfNotice(null);
    scrollTo(heroRef.current);
  }, [scrollTo]);

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
        text: `${file.name} loaded (${pages} ${pages === 1 ? "page" : "pages"}). Hit "Review my lease" to analyze it — or paste text above to use that instead.`,
      });
    } catch {
      setPdfNotice({ tone: "warn", text: PDF_FAILED });
    } finally {
      setPdfBusy(false);
    }
  }, []);

  return (
    <main>
      {/* 1 — Hero */}
      <section
        ref={heroRef}
        className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-20"
      >
        <div className="w-full max-w-2xl">
          <h1 className="text-center font-serif text-[3.25rem] font-light leading-[1.04] tracking-[-0.02em] text-ink sm:text-7xl">
            Know what you&rsquo;re signing.
          </h1>
          <p className="mx-auto mt-6 max-w-md text-center text-lg leading-8 text-muted">
            Paste your lease. See the clauses worth reviewing, explained in
            plain English — so you can sign with a clear head.
          </p>

          <div className="mt-12">
            <div className="mb-3 flex items-center justify-end">
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
              rows={9}
              aria-label="Lease text"
              className="min-h-52"
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
            <p className="mt-5 text-center text-sm text-muted/80">
              {DISCLAIMER}
            </p>
          </div>
        </div>
      </section>

      {/* 2 & 3 — Analyzing / Results */}
      {status !== "idle" && (
        <section ref={outputRef} className="min-h-screen bg-canvas">
          {status === "loading" && <Analyzing />}

          {status === "error" && (
            <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
              <div className="max-w-md">
                <h2 className="font-serif text-3xl text-ink">
                  That one didn&rsquo;t go through.
                </h2>
                <p className="mt-4 leading-8 text-muted">
                  We couldn&rsquo;t read this lease just now — it sometimes takes
                  a second try. Your text is still here.
                </p>
                <Button onClick={handleReview} className="mt-8">
                  Try again
                </Button>
              </div>
            </div>
          )}

          {status === "done" && (
            <div className="bg-canvas py-24 sm:py-32">
              <ResultsHeader count={flags.length} />

              {flags.length > 0 && (
                <div className="mx-auto mt-16 flex max-w-2xl flex-col gap-6 px-6">
                  {flags.map((flag, i) => (
                    <FlagCard key={i} flag={flag} index={i} />
                  ))}
                </div>
              )}

              <div className="mx-auto mt-20 max-w-2xl px-6 text-center">
                <Button variant="link" onClick={reset}>
                  Review another lease
                </Button>
                <p className="mt-10 border-t border-hairline pt-8 text-sm text-muted/80">
                  {DISCLAIMER}
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
