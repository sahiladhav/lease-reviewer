const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type Severity = "High" | "Medium" | "Low";

type LeaseFlag = {
  clause: string;
  severity: Severity;
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
- "plainEnglish": what the clause says, explained in simple terms
- "whyItMatters": the practical risk or impact to the renter
- "questionToAsk": a comprehension-oriented question the renter could ask their landlord or a housing office to clarify the clause

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
      throw new Error(`Gemini API returned status ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const rawText: string | undefined =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Gemini API returned no content.");
    }

    const cleaned = stripCodeFences(rawText);
    const flags = JSON.parse(cleaned) as LeaseFlag[];

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
