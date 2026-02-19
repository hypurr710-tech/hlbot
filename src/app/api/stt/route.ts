import { NextRequest } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File;

  if (!audioFile) {
    return new Response(JSON.stringify({ error: "Audio file required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const openai = new OpenAI({ apiKey });

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: "en",
    response_format: "text",
  });

  return new Response(JSON.stringify({ text: transcription }), {
    headers: { "Content-Type": "application/json" },
  });
}
