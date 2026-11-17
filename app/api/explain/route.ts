import { NextResponse } from "next/server";
import { z } from "zod";
import { generateMarathiExplanation } from "@/lib/adapters/gemini";
import type { AnalysisOutput } from "@/lib/types";

const ExplainRequestSchema = z.object({
  analysis: z.record(z.any()),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ExplainRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid analysis payload" }, { status: 400 });
    }
    const explanation = await generateMarathiExplanation(
      parsed.data.analysis as unknown as AnalysisOutput
    );
    return NextResponse.json(explanation);
  } catch (err) {
    console.error("/api/explain error:", err);
    return NextResponse.json({ error: "Failed to generate explanation" }, { status: 500 });
  }
}
