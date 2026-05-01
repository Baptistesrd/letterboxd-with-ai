import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a personal taste intelligence engine. Analyze this person's complete cultural profile and give 6 film recommendations, 4 book recommendations, and 4 album recommendations they haven't consumed yet.
Return ONLY this JSON (no markdown, no code blocks, no explanation):
{"films":[{"title":"...","year":2020,"reason":"...","tmdb_id":12345}],"books":[{"title":"...","author":"...","year":2019,"reason":"...","ol_key":"/works/OL45804W"}],"albums":[{"title":"...","artist":"...","year":2018,"reason":"...","mbid":"..."}]}
Each reason must be 1 sentence explaining the cross-media connection (e.g. "Your love of Kubrick's cold precision matches this album's clinical electronics").

${body.prompt}`,
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 2000 },
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

    if (data.promptFeedback?.blockReason) {
      console.error("Gemini blocked prompt:", data.promptFeedback.blockReason);
      return NextResponse.json(
        { error: "Request blocked by AI safety filters." },
        { status: 400 }
      );
    }

    const rawText: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 500 }
      );
    }

    if (
      !Array.isArray(result.films) ||
      !Array.isArray(result.books) ||
      !Array.isArray(result.albums)
    ) {
      console.error("Invalid structure from Gemini:", result);
      return NextResponse.json(
        { error: "AI returned unexpected structure. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Foryou route error:", err);
    return NextResponse.json(
      { error: "Failed to generate recommendations. Please try again." },
      { status: 500 }
    );
  }
}
