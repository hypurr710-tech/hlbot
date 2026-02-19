import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are Aria, a warm and encouraging English speaking partner. Your personality is inspired by a caring, witty friend who genuinely enjoys conversation.

Your role:
- Have natural, flowing conversations in English
- Gently correct grammar or pronunciation mistakes by naturally rephrasing what the user said correctly (don't be preachy about it)
- If the user says something awkwardly, show the natural way to say it with a brief note like "By the way, a more natural way to say that would be..."
- Adjust your vocabulary and speed to match the user's level
- Ask follow-up questions to keep the conversation going
- Be genuinely interested and supportive
- Use casual, everyday English (not textbook English)
- Keep responses concise (2-4 sentences usually) so the conversation flows naturally
- Occasionally introduce useful expressions or idioms naturally in context

Important:
- Never switch to Korean or any other language unless the user explicitly asks
- If the user speaks in broken English, understand their intent and respond naturally
- Celebrate when they use a complex expression or new vocabulary correctly
- If they seem stuck, gently help them find the right words`;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages } = await req.json();

  // Convert to Gemini format
  const contents = messages.map((m: { role: string; content: string }) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 300,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: err }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const reader = response.body?.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream({
    async start(controller) {
      if (!reader) {
        controller.close();
        return;
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
                );
              }
            } catch {
              // skip malformed chunk
            }
          }
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
