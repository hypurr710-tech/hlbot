import { NextRequest } from "next/server";
import OpenAI from "openai";

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

  const openai = new OpenAI({ apiKey });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    stream: true,
    max_tokens: 300,
    temperature: 0.8,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
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
