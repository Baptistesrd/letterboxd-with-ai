import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a personal taste intelligence engine. Return ONLY a JSON object.
            Structure: {"films":[{"title":"","year":2024,"reason":"","tmdb_id":0}],"books":[{"title":"","author":"","year":2024,"reason":"","ol_key":""}],"albums":[{"title":"","artist":"","year":2024,"reason":"","mbid":""}]}
            Reasons must be 1 sentence about cross-media connection.`
          },
          {
            role: "user",
            content: body.prompt
          }
        ],
        response_format: { type: "json_object" }, // Force le JSON pur
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Groq API Error:", err);
      return NextResponse.json({ error: "Groq service error" }, { status: response.status });
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Culture route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
