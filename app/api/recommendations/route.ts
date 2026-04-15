import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a world-class film critic and recommendation engine.
Analyze the user's viewing patterns and ratings to recommend films they haven't seen yet.
Return ONLY a valid JSON array — no markdown, no explanation, no code blocks.
Format: [{"title": string, "year": number, "reason": string, "tmdb_id": number}]
The "reason" must be 1-2 sentences explaining why THIS specific viewer would love this film based on their unique taste profile.
Include both acclaimed classics and hidden gems. Prioritize variety across genres and decades.

${body.prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini API error:", response.status, text);
      return NextResponse.json(
        { error: `AI service error (${response.status})` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawText: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

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
