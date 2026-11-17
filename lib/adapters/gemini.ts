import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisOutput } from "../types";

export interface ExplainOutput {
  summary_mr: string;
  crop_notes_mr: string[];
  uncertainty_mr: string;
  next_steps_mr: string[];
  used_fallback: boolean;
}

export interface ChatOutput {
  answer_mr: string;
  refused: boolean;
  used_fallback: boolean;
}

function buildTemplateExplanation(analysis: AnalysisOutput): ExplainOutput {
  const locMr = analysis.location.name_mr;
  const gwMr =
    analysis.groundwater.category === "SAFE"
      ? "सुरक्षित (SAFE)"
      : analysis.groundwater.category === "SEMI_CRITICAL"
        ? "निम-संवेदनशील (SEMI-CRITICAL)"
        : analysis.groundwater.category === "CRITICAL"
          ? "संवेदनशील (CRITICAL)"
          : analysis.groundwater.category === "OVER_EXPLOITED"
            ? "अति-उपसा (OVER-EXPLOITED)"
            : "माहिती उपलब्ध नाही (UNKNOWN)";

  if (analysis.post_sowing) {
    const ps = analysis.post_sowing;
    return {
      summary_mr: `${locMr} येथे ${ps.name_mr} पिकाची सध्या ${ps.current_stage_label_mr} सुरू आहे. पुढील १४ दिवसांत पिकाची पाण्याची गरज ${ps.next_14d_etc_mm} मिमी आणि अपेक्षित पाऊस ${ps.next_14d_forecast_rain_mm} मिमी आहे (तूट: ${ps.next_14d_deficit_mm} मिमी).`,
      crop_notes_mr: ps.guidance_cards.map((c) => `${c.title_mr}: ${c.body_mr}`),
      uncertainty_mr: analysis.confidence.reasons_mr.join(" "),
      next_steps_mr: [
        "जमिनीतील ओलावा तपासूनच संरक्षणात्मक सिंचन द्या.",
        "कीड किंवा रोगाच्या लक्षणांसाठी जवळच्या कृषी विज्ञान केंद्राचा (KVK) सल्ला घ्या.",
      ],
      used_fallback: true,
    };
  }

  const top = analysis.pre_sowing?.ranked_crops[0];
  const second = analysis.pre_sowing?.ranked_crops[1];
  return {
    summary_mr: `${locMr} (${gwMr} भूजल) साठी पाणी-संतुलन गणितानुसार ${top?.name_mr ?? ""} हे पीक प्रथम क्रमांकावर आहे (गुण: ${top?.scores.total ?? 0}/100, पाण्याची तूट: ${top?.water_gap_mm ?? 0} मिमी).`,
    crop_notes_mr: [
      top
        ? `१. ${top.name_mr}: एकूण गुण ${top.scores.total}/100, पाण्याची गरज ${top.water_demand_etc_mm} मिमी, तूट ${top.water_gap_mm} मिमी.`
        : "",
      second
        ? `२. ${second.name_mr}: एकूण गुण ${second.scores.total}/100, पाण्याची गरज ${second.water_demand_etc_mm} मिमी, तूट ${second.water_gap_mm} मिमी.`
        : "",
    ].filter(Boolean),
    uncertainty_mr: analysis.confidence.reasons_mr.join(" "),
    next_steps_mr: [
      "पेरणीपूर्वी जमिनीतील ओलावा आणि स्थानिक बियाणे उपलब्धता तपासा.",
      "पिकाचे तपशील पाहून 'जर-तर' (What-If) स्लायडरने पावसातील बदलाचा परिणाम तपासा.",
    ],
    used_fallback: true,
  };
}

const OFF_TOPIC_PATTERNS = [
  /कीड|किड|अळी|रोग|बुरशी|फवारणी|औषध|pest|disease|insect|fungicide|pesticide/i,
  /खत|युरिया|डीएपी|fertilizer|urea|dap|npk/i,
  /बाजारभाव|भाव|दर|मंडी|market|price|msp|mandi/i,
];

function buildTemplateChat(question: string, analysis: AnalysisOutput): ChatOutput {
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(question))) {
    return {
      answer_mr:
        "माफ करा, मी फक्त पाणी-संतुलन, पिकाची पाण्याची गरज, भूजल स्थिती आणि दिलेल्या विश्लेषणाबद्दलच माहिती देऊ शकतो. कीड-रोग, खत व्यवस्थापन किंवा बाजारभावासाठी कृपया जवळच्या कृषी विज्ञान केंद्राशी (KVK) किंवा कृषी अधिकाऱ्यांशी संपर्क साधा.",
      refused: true,
      used_fallback: true,
    };
  }

  if (analysis.post_sowing) {
    const ps = analysis.post_sowing;
    return {
      answer_mr: `${ps.name_mr} पिकाची सध्या ${ps.current_stage_label_mr} सुरू आहे. पुढील १४ दिवसांत ${ps.next_14d_etc_mm} मिमी पाण्याची गरज असून ${ps.next_14d_forecast_rain_mm} मिमी पाऊस अपेक्षित आहे (तूट: ${ps.next_14d_deficit_mm} मिमी). उभ्या पिकाचे संरक्षण करण्यासाठी ओलावा टिकवा आणि गरजेनुसार हलके पाणी द्या.`,
      refused: false,
      used_fallback: true,
    };
  }

  const top = analysis.pre_sowing?.ranked_crops[0];
  return {
    answer_mr: `${analysis.location.name_mr} साठी दिलेल्या विश्लेषणात ${top?.name_mr ?? ""} हे पीक ${top?.scores.total ?? 0}/100 गुणांसह सर्वात योग्य ठरले आहे (पाण्याची तूट: ${top?.water_gap_mm ?? 0} मिमी). हे केवळ पाणी-संतुलनावर आधारित आहे; अंतिम निर्णयासाठी स्थानिक कृषी सल्ला घ्या.`,
    refused: false,
    used_fallback: true,
  };
}

export async function generateMarathiExplanation(
  analysis: AnalysisOutput
): Promise<ExplainOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildTemplateExplanation(analysis);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const compactPayload = {
      location: analysis.location.name_mr,
      groundwater: analysis.groundwater.category,
      confidence: analysis.confidence.level,
      top_crops: analysis.pre_sowing?.ranked_crops.slice(0, 3).map((c) => ({
        name_mr: c.name_mr,
        score: c.scores.total,
        etc_mm: c.water_demand_etc_mm,
        gap_mm: c.water_gap_mm,
        risk: c.water_risk,
      })),
      post_sowing: analysis.post_sowing
        ? {
            crop_mr: analysis.post_sowing.name_mr,
            stage_mr: analysis.post_sowing.current_stage_label_mr,
            etc_14d: analysis.post_sowing.next_14d_etc_mm,
            rain_14d: analysis.post_sowing.next_14d_forecast_rain_mm,
            deficit_14d: analysis.post_sowing.next_14d_deficit_mm,
          }
        : undefined,
    };

    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are Jal-Krishi AI's Marathi agricultural explainer. Explain ONLY the numbers and crops in this JSON payload in clear, simple Marathi for a Maharashtra farmer. Never invent numbers, never change rankings, never recommend uprooting a standing crop.\n\nPayload:\n${JSON.stringify(compactPayload)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary_mr: { type: Type.STRING },
            crop_notes_mr: { type: Type.ARRAY, items: { type: Type.STRING } },
            uncertainty_mr: { type: Type.STRING },
            next_steps_mr: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["summary_mr", "crop_notes_mr", "uncertainty_mr", "next_steps_mr"],
        },
      },
    });

    const parsed = JSON.parse(res.text ?? "{}") as Omit<ExplainOutput, "used_fallback">;
    if (!parsed.summary_mr) return buildTemplateExplanation(analysis);
    return { ...parsed, used_fallback: false };
  } catch {
    return buildTemplateExplanation(analysis);
  }
}

export async function generateMarathiChatAnswer(
  question: string,
  analysis: AnalysisOutput
): Promise<ChatOutput> {
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(question))) {
    return buildTemplateChat(question, analysis);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildTemplateChat(question, analysis);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are Jal-Krishi AI's Marathi assistant. Answer the farmer's question strictly using the provided analysis JSON. If the question asks about pests, diseases, fertilizers, market prices, or anything outside water-balance and crop suitability, set refused=true and politely refer them to KVK/agriculture officer in Marathi.\n\nQuestion: ${question}\n\nAnalysis:\n${JSON.stringify({
        location: analysis.location.name_mr,
        groundwater: analysis.groundwater.category,
        top_crops: analysis.pre_sowing?.ranked_crops.slice(0, 4).map((c) => ({
          name_mr: c.name_mr,
          score: c.scores.total,
          gap_mm: c.water_gap_mm,
        })),
        post_sowing: analysis.post_sowing,
      })}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer_mr: { type: Type.STRING },
            refused: { type: Type.BOOLEAN },
          },
          required: ["answer_mr", "refused"],
        },
      },
    });

    const parsed = JSON.parse(res.text ?? "{}") as { answer_mr?: string; refused?: boolean };
    if (!parsed.answer_mr) return buildTemplateChat(question, analysis);
    return {
      answer_mr: parsed.answer_mr,
      refused: Boolean(parsed.refused),
      used_fallback: false,
    };
  } catch {
    return buildTemplateChat(question, analysis);
  }
}
