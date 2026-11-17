import { NextResponse } from "next/server";
import { z } from "zod";
import { generateMarathiChatAnswer } from "@/lib/adapters/gemini";
import type { AnalysisOutput } from "@/lib/types";

const ChatRequestSchema = z.object({
  question: z.string().min(1).max(400),
  analysis: z.record(z.any()),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });
    }
    const answer = await generateMarathiChatAnswer(
      parsed.data.question,
      parsed.data.analysis as unknown as AnalysisOutput
    );
    return NextResponse.json(answer);
  } catch (err) {
    console.error("/api/chat error:", err);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
