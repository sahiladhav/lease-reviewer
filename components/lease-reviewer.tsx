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
  "This is not legal advice. It flags clauses for your review.";

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
  "We couldn't read text from this file. It may be a scanned image, so please paste your lease text instead.";
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
  // Use the legacy build: it's transpiled for broad browser support, so
  // extraction works in Safari too (the modern build uses newer JS that
  // older Safari lacks). Let the bundler resolve and emit the worker so it
  // gets a hashed URL served with the correct MIME type in production.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

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
// Ladies", varied heights stepping up to the right, thin single-weight
// monochrome ink strokes, no fill: gables, bay windows, doorways, steps.
function HeroArt({ className }: { className?: string }) {
  const houses = [
    { x: 150, w: 180, base: 298, eave: 158, apex: 110, finial: false },
    { x: 330, w: 192, base: 292, eave: 140, apex: 86, finial: true },
    { x: 522, w: 192, base: 286, eave: 132, apex: 78, finial: false },
    { x: 714, w: 212, base: 280, eave: 112, apex: 52, finial: true },
  ];

  // A four-pane window with a lintel above.
  const win = (x: number, y: number, w: number, h: number): string[] => [
    `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`,
    `M${x + w / 2} ${y} L${x + w / 2} ${y + h}`,
    `M${x} ${y + h / 2} L${x + w} ${y + h / 2}`,
    `M${x - 3} ${y - 4} L${x + w + 3} ${y - 4}`,
  ];

  const house = ({
    x,
    w,
    base,
    eave,
    apex,
  }: (typeof houses)[number]): string[] => {
    const fh = (base - eave) / 3;
    const yB = eave + fh;
    const yC = eave + 2 * fh;
    const cx = x + w / 2;
    const p: string[] = [];

    // gabled roof + double cornice
    p.push(`M${x - 4} ${eave} L${cx} ${apex} L${x + w + 4} ${eave}`);
    p.push(`M${x} ${eave} L${x + w} ${eave}`);
    p.push(`M${x + 4} ${eave + 7} L${x + w - 4} ${eave + 7}`);
    // walls, floor, and floor dividers
    p.push(`M${x} ${eave} L${x} ${base}`);
    p.push(`M${x + w} ${eave} L${x + w} ${base}`);
    p.push(`M${x} ${base} L${x + w} ${base}`);
    p.push(`M${x} ${yB} L${x + w} ${yB}`);
    p.push(`M${x} ${yC} L${x + w} ${yC}`);

    // top floor: two windows
    const aW = w * 0.2;
    const aY = eave + fh * 0.3;
    const aH = fh * 0.46;
    p.push(...win(x + w * 0.15, aY, aW, aH));
    p.push(...win(x + w * 0.85 - aW, aY, aW, aH));

    // middle floor: projecting bay window with its own cornice
    const bayW = w * 0.64;
    const bx = x + (w - bayW) / 2;
    const bTop = yB + fh * 0.2;
    const bBot = yC - fh * 0.04;
    const bMid = (bTop + bBot) / 2;
    p.push(
      `M${bx - 4} ${bTop} L${bx + 8} ${bTop - 9} L${bx + bayW - 8} ${bTop - 9} L${bx + bayW + 4} ${bTop}`
    );
    p.push(`M${bx} ${bTop} L${bx} ${bBot}`);
    p.push(`M${bx + bayW} ${bTop} L${bx + bayW} ${bBot}`);
    p.push(`M${bx} ${bTop} L${bx + bayW} ${bTop}`);
    p.push(`M${bx} ${bBot} L${bx + bayW} ${bBot}`);
    p.push(`M${bx + bayW / 3} ${bTop} L${bx + bayW / 3} ${bBot}`);
    p.push(`M${bx + (2 * bayW) / 3} ${bTop} L${bx + (2 * bayW) / 3} ${bBot}`);
    p.push(`M${bx} ${bMid} L${bx + bayW} ${bMid}`);

    // ground floor: arched doorway with steps + one window
    const dW = w * 0.17;
    const dx = x + w * 0.13;
    const dTop = yC + fh * 0.22;
    const dBot = base - 4;
    p.push(
      `M${dx} ${dBot} L${dx} ${dTop + 10} Q${dx} ${dTop} ${dx + dW / 2} ${dTop} Q${dx + dW} ${dTop} ${dx + dW} ${dTop + 10} L${dx + dW} ${dBot}`
    );
    p.push(`M${dx + dW / 2} ${dTop + 6} L${dx + dW / 2} ${dBot}`);
    p.push(`M${dx - 6} ${base} L${dx + dW + 6} ${base}`);
    p.push(`M${dx - 3} ${base - 4} L${dx + dW + 3} ${base - 4}`);
    p.push(...win(x + w * 0.54, yC + fh * 0.26, w * 0.26, fh * 0.42));

    return p;
  };

  return (
    <svg
      className={className}
      viewBox="0 30 1120 300"
      role="img"
      aria-label="Line sketch of a row of four Victorian houses"
      style={{ color: "var(--color-ink)" }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.62"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {houses.flatMap((h, hi) =>
          house(h).map((d, i) => <path key={`${hi}-${i}`} d={d} />)
        )}
        {houses
          .filter((h) => h.finial)
          .map((h, i) => (
            <path
              key={`fin-${i}`}
              d={`M${h.x + h.w / 2} ${h.apex} L${h.x + h.w / 2} ${h.apex - 12}`}
            />
          ))}
        {houses.map((h, i) => (
          <circle
            key={`vent-${i}`}
            cx={h.x + h.w / 2}
            cy={h.apex + (h.eave - h.apex) * 0.46}
            r="5"
          />
        ))}
        <path d="M76 306 L1044 274" strokeOpacity="0.5" />
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

// Compact card: clause heading, severity, and a short one-line summary. The
// whole card is the affordance, click (or Enter/Space) toggles the detail
// open in place; no button or arrow.
function FlagCard({ flag, index }: { flag: LeaseFlag; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[flag.severity];
  const toggle = () => setOpen((v) => !v);

  return (
    <Reveal delay={Math.min(index, 6) * 55}>
      <article
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex min-h-32 cursor-pointer flex-col rounded-2xl border border-hairline bg-card p-5 shadow-[0_1px_2px_rgba(33,29,24,0.03)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-[0_8px_24px_rgba(33,29,24,0.08)] focus-visible:ring-2 focus-visible:ring-ink/20"
        style={{ borderLeft: `3px solid ${meta.color}` }}
      >
        <div className="mb-2 flex items-center gap-2.5">
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
        <p className="text-sm leading-6 text-body">{flag.headline}</p>

        {open && (
          <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm leading-6">
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
        Going clause by clause. Just a few seconds.
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
      ? "This reads like a standard lease, but give it your own read."
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
    } catch (err) {
      console.error("PDF extraction failed:", err);
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
          <ul className="mx-auto mt-7 flex max-w-lg flex-col gap-5 text-left text-base text-muted sm:text-lg">
            {[
              "Paste your lease, or upload the PDF.",
              "See the clauses worth a closer look, in plain English.",
              "Learn why each one matters, and what to ask.",
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

      {/* Input, centered above the results */}
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

      {/* Results, full-width, three across on desktop */}
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
                  We couldn&rsquo;t read this lease just now. It sometimes takes
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
                <>
                  <p className="mt-6 text-center text-sm text-muted">
                    Open any card to read the full details, why it matters, and a
                    question to ask.
                  </p>
                  <div className="mt-6 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {flags.map((flag, i) => (
                      <FlagCard key={i} flag={flag} index={i} />
                    ))}
                  </div>
                </>
              )}
              <div className="mt-10 text-center">
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
