import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Le prompt est vide" }, { status: 400 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Utilisation d'un modèle stable et rapide
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "Tu es un moteur de recommandation de films. Tu dois répondre EXCLUSIVEMENT avec un objet JSON valide. Ne pas ajouter de texte avant ou après le JSON. Format : {\"recommendations\": [{\"title\":\"...\", \"year\":2020, \"reason\":\"...\", \"tmdb_id\":123}]}"
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        // On force la réponse en format JSON
        response_format: { type: "json_object" }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API Error:", data);
      return NextResponse.json({ error: data.error?.message || "Erreur Groq" }, { status: response.status });
    }

    // On extrait le contenu texte de la réponse de l'IA
    const content = data.choices[0]?.message?.content;
    const parsedContent = JSON.parse(content);

    return NextResponse.json(parsedContent);
  } catch (error: any) {
    console.error("Server Route Error:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
