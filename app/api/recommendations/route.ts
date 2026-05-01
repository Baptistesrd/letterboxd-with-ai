import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.prompt) {
      return NextResponse.json({ error: "Le prompt est vide" }, { status: 400 });
    }

    const { prompt, watchedIds = [] } = body;
    const excludeList = (watchedIds as string[]).join(",");

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const systemPrompt = `You are an arthouse and world cinema specialist with encyclopedic knowledge of film history.
Your mission: surface hidden gems, cult classics, and underseen films that match this viewer's taste.

ABSOLUTE RULES:
- NEVER recommend any film with these TMDB IDs: ${excludeList || "none"}
- NEVER recommend films with global box office over $200M unless they are considered cult or arthouse
- NEVER recommend: Pulp Fiction, Inception, The Dark Knight, Joker, Fight Club, Interstellar, Parasite, or any film that appears in generic "best movies ever" lists
- ALWAYS prioritize: films from non-English speaking countries, films from the 1960s-1990s, debut features, films by directors adjacent to the user's favorites
- AIM for films with TMDB vote_count between 500-50000 (popular enough to be real, obscure enough to surprise)

The "reason" field must reference something SPECIFIC from the viewer's taste profile — never write generic reasons like "you'll enjoy this film".

Return JSON object: {"recommendations": [{"title":"...","year":2020,"reason":"...","tmdb_id":12345}]}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API Error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Erreur Groq" },
        { status: response.status }
      );
    }

    const parsed = JSON.parse(data.choices[0]?.message?.content ?? "{}");
    const recommendations: unknown[] = parsed.recommendations ?? [];

    const filtered = recommendations.filter(
      (rec: unknown) =>
        !(watchedIds as string[]).includes(String((rec as { tmdb_id?: number }).tmdb_id))
    );

    return NextResponse.json({ recommendations: filtered });
  } catch (error: unknown) {
    console.error("Server Route Error:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
