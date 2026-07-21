const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Severity = "High" | "Medium" | "Low";

type LeaseFlag = {
  clause: string;
  severity: Severity;
  headline: string;
  plainEnglish: string;
  whyItMatters: string;
  questionToAsk: string;
};

function buildPrompt(leaseText: string): string {
  return `You are analyzing a residential lease agreement to help a renter understand what they are signing.

Read the lease text below and identify clauses worth the renter's attention. Return ONLY strict JSON — no markdown formatting, no code fences, no prose before or after — representing an array of "flag" objects.

Each flag object must have exactly these fields:
- "clause": a short label for the clause (string)
- "severity": one of "High", "Medium", or "Low"
- "headline": a very short, punchy line stating the practical consequence to the renter. Max ~8 words. Write what it means for THEM, not what the clause says. Do not use em dashes. Keep it reassuring for Low/standard clauses. Examples: "Your landlord can enter without warning." / "You could lose your whole deposit if you leave early." / "You pay for repairs you didn't cause." / "Standard 24-hour notice, this one is normal."
- "plainEnglish": what the clause says, explained in simple terms
- "whyItMatters": the practical risk or impact to the renter
- "questionToAsk": a comprehension-oriented question the renter could ask their landlord or a housing office to clarify the clause

Writing style — applies to headline, plainEnglish, whyItMatters, and questionToAsk:
- Write at roughly an 8th-grade reading level. Use everyday words and short sentences.
- Use active voice. Say "The landlord can keep your deposit," not "The deposit may be retained."
- Keep sentences under ~20 words where you can.
- Avoid legal jargon entirely. If a legal term is unavoidable, explain it right away in plain words.
- Write like you're explaining it to a friend who has never signed a lease — not like a lawyer or a textbook.

Severity measures RISK TO THE RENTER based on the clause's actual terms — not the topic it covers. Grade the specific terms, not the subject. A clause about deposits, entry, or repairs is NOT automatically Medium; a protective version and a predatory version of the same clause get very different severities.
- "High": terms that are clearly unfavorable, one-sided, or risky to the renter. Examples: discretionary or "sole judgment" deposit deductions, landlord entry with no notice, tenant liable for all repairs, deposit forfeiture on early termination, waivers of tenant rights (jury trial, class action).
- "Medium": terms that impose a real but normal cost or restriction the renter should note. Examples: a genuine late fee, a guest limit, a rent-increase mechanism with real teeth.
- "Low": terms that are standard, legally compliant, or actively protective of the renter. This INCLUDES tenant-favorable clauses — 24-hour entry notice, deposits protected against normal wear and tear, landlord covers repairs, subletting allowed with reasonable consent, legally-compliant renewal terms. If a clause follows the legal norm or benefits the tenant, it is Low. For such clauses, frame "whyItMatters" as reassuring rather than concerning.

Do NOT grade by topic. Deposits/entry/repairs are not inherently High or Medium — a fair, protective term on any of those is Low. On a fair, standard lease, most flags should be Low.

What to flag — relevance filter:
- Flag ONLY clauses that genuinely warrant the renter's attention: those carrying real financial risk, legal or rights implications, restrictions on the renter, or genuine ambiguity.
- SKIP boilerplate and standard administrative content the renter does not need to act on. Do not flag definitions, signature blocks, standard legal recitals, severability/governing-law boilerplate, or routine notice mechanics.
- Low severity still applies to substantive-but-minor clauses (e.g. routine utility responsibility, standard notice periods) — include those. It does NOT mean "flag every line of the document."
- Prioritize by importance: list the most significant clauses first. Include any substantive Low-severity clauses that exist — do not omit them just because higher-severity clauses are present; the renter benefits from seeing that most of the lease is standard. The final list is trimmed downstream, so return every clause that passes this filter rather than pre-limiting the count.

Critical rules:
- Only flag clauses that are actually present in the provided lease text. Never invent, assume, or hallucinate clauses that are not there.
- Never give legal verdicts or conclusions. Never say a clause is "illegal," "unenforceable," or "don't sign this." You are not a lawyer and must not act like one.
- Frame every flag as something for the renter to review and ask about, not as a legal judgment.
- If the lease text contains no noteworthy clauses, return an empty array.

Lease text:
"""
${leaseText}
"""

Return only the JSON array.`;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

const SEVERITY_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };

// Trim a long lease to a manageable list, but reserve slots so Low-severity
// clauses aren't entirely pushed out by higher-severity ones — the renter
// should still see that most of the lease is standard.
const FLAG_CAP = 10;
const RESERVED_LOW_SLOTS = 2;

function capFlags(sorted: LeaseFlag[]): LeaseFlag[] {
  if (sorted.length <= FLAG_CAP) return sorted;

  const lows = sorted.filter((f) => f.severity === "Low");
  const nonLows = sorted.filter((f) => f.severity !== "Low");

  // Reserve slots for Lows so higher-severity clauses can't crowd them all
  // out, then fill the rest with the top High/Medium clauses. Any slots the
  // High/Medium clauses don't use are backfilled with more Lows.
  const reserved = Math.min(lows.length, RESERVED_LOW_SLOTS);
  const nonLowCount = Math.min(nonLows.length, FLAG_CAP - reserved);
  const lowCount = Math.min(lows.length, FLAG_CAP - nonLowCount);

  // Inputs are pre-sorted High -> Medium -> Low with importance order preserved
  // within each tier, so slicing from the front keeps the highest-priority
  // items, and concatenating keeps the final list sorted.
  return [...nonLows.slice(0, nonLowCount), ...lows.slice(0, lowCount)];
}

const SEVERITIES: readonly string[] = ["High", "Medium", "Low"];

const TEXT_FIELDS = [
  "clause",
  "headline",
  "plainEnglish",
  "whyItMatters",
  "questionToAsk",
] as const;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function validateFlag(value: unknown, index: number): LeaseFlag {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Gemini returned ${describe(value)} instead of a flag object at index ${index}.`
    );
  }

  const flag = value as Record<string, unknown>;

  for (const field of TEXT_FIELDS) {
    const fieldValue = flag[field];
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
      throw new Error(
        `Gemini returned a flag missing '${field}' at index ${index}.`
      );
    }
  }

  if (typeof flag.severity !== "string" || !SEVERITIES.includes(flag.severity)) {
    throw new Error(
      `Gemini returned invalid severity at index ${index}: ${JSON.stringify(flag.severity)}.`
    );
  }

  return {
    clause: flag.clause as string,
    severity: flag.severity as Severity,
    headline: flag.headline as string,
    plainEnglish: flag.plainEnglish as string,
    whyItMatters: flag.whyItMatters as string,
    questionToAsk: flag.questionToAsk as string,
  };
}

function parseLeaseFlags(rawText: string): LeaseFlag[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    throw new Error("Gemini returned a response that was not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Gemini returned ${describe(parsed)} instead of an array of flags.`
    );
  }

  const flags = parsed.map(validateFlag);
  flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return capFlags(flags);
}

export async function POST(request: Request) {
  let body: { leaseText?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const leaseText = body?.leaseText;
  if (typeof leaseText !== "string" || leaseText.trim().length === 0) {
    return Response.json(
      { error: "leaseText is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server is not configured with a Gemini API key." },
      { status: 500 }
    );
  }

  try {
    const geminiResponse = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(leaseText) }],
          },
        ],
      }),
    });

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();
      throw new Error(
        `Gemini API returned status ${geminiResponse.status}: ${details}`
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText: string | undefined =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Gemini API returned no content.");
    }

    let flags: LeaseFlag[];
    try {
      flags = parseLeaseFlags(rawText);
    } catch (validationError) {
      console.error("Gemini raw response was:", rawText);
      throw validationError;
    }

    return Response.json(flags);
  } catch (error) {
    console.error("Lease review failed:", error);
    return Response.json(
      {
        error:
          "We couldn't analyze this lease right now. Please try again in a moment.",
      },
      { status: 500 }
    );
  }
}
