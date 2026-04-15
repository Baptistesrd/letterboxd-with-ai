import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Recommendation service is not configured." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `You are a world-class film critic and recommendation engine.
Analyze the user's viewing patterns and ratings to recommend films they haven't seen yet.
Return ONLY a valid JSON array — no markdown, no explanation, no code blocks.
Format: [{"title": string, "year": number, "reason": string, "tmdb_id": number}]
The "reason" must be 1-2 sentences explaining why THIS specific viewer would love this film based on their unique taste profile.
Include both acclaimed classics and hidden gems. Prioritize variety across genres and decades.`,
        messages: [{ role: "user", content: body.prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);
      return NextResponse.json(
        { error: `AI service error (${response.status})` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text ?? "[]";

    // Strip any accidental markdown code fences Claude might add
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const recommendations = JSON.parse(cleaned);

    if (!Array.isArray(recommendations)) {
      throw new Error("Claude did not return an array");
    }

    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("Recommendations route error:", err);
    return NextResponse.json(
      { error: "Failed to generate recommendations. Please try again." },
      { status: 500 }
    );
  }
}
