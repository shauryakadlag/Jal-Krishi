import type {
  CropRecord,
  DailyWeatherPoint,
  PostSowingResult,
  StageBreakdown,
  WeatherSourceKind,
} from "../types";
import { diffDays } from "./dates";
import { getDailyKc } from "./waterBalance";

export function runPostSowingAnalysis(params: {
  crop: CropRecord;
  sowingDate: string;
  referenceDate: string;
  forecastDays: DailyWeatherPoint[];
  weatherSourceKind: WeatherSourceKind;
  isDemoScenario: boolean;
}): PostSowingResult {
  const { crop, sowingDate, referenceDate, forecastDays, weatherSourceKind, isDemoScenario } = params;
  const daysSince = Math.max(0, diffDays(sowingDate, referenceDate));

  const [fIni, fDev, fMid] = crop.stage_fractions;
  const dIni = Math.max(1, Math.round(crop.duration_days * fIni));
  const dDev = Math.max(1, Math.round(crop.duration_days * fDev));
  const dMid = Math.max(1, Math.round(crop.duration_days * fMid));

  let currentStage: StageBreakdown["stage"] = "LATE";
  let currentStageEn = "Late-season";
  let currentStageMr = "पक्वतेची अवस्था";

  if (daysSince < dIni) {
    currentStage = "INITIAL";
    currentStageEn = "Initial";
    currentStageMr = "सुरुवातीची अवस्था";
  } else if (daysSince < dIni + dDev) {
    currentStage = "DEVELOPMENT";
    currentStageEn = "Development";
    currentStageMr = "वाढीची अवस्था";
  } else if (daysSince < dIni + dDev + dMid) {
    currentStage = "MID";
    currentStageEn = "Mid-season (Critical)";
    currentStageMr = "मध्य अवस्था (संवेदनशील)";
  }

  const window14 = forecastDays.slice(0, 14);
  let next14Etc = 0;
  let next14Rain = 0;
  for (let i = 0; i < window14.length; i++) {
    const dayIdx = Math.min(crop.duration_days - 1, daysSince + i);
    const kc = getDailyKc(crop, dayIdx);
    next14Etc += kc * window14[i].et0_mm;
    next14Rain += window14[i].rain_mm;
  }

  next14Etc = Number(next14Etc.toFixed(1));
  next14Rain = Number(next14Rain.toFixed(1));
  const next14Deficit = Number(Math.max(0, next14Etc - next14Rain).toFixed(1));

  const next14Status: PostSowingResult["next_14d_status"] =
    next14Deficit <= 15 ? "ADEQUATE" : next14Deficit <= 40 ? "MILD_DEFICIT" : "SEVERE_DEFICIT";

  const guidance_cards: PostSowingResult["guidance_cards"] = [];

  if (next14Status === "SEVERE_DEFICIT") {
    guidance_cards.push({
      id: "protective-irrigation",
      title_en: "Prioritize protective irrigation",
      title_mr: "संरक्षणात्मक सिंचनाला प्राधान्य द्या",
      body_en: `Next 14-day crop water demand (${next14Etc} mm) exceeds expected rain (${next14Rain} mm) by ${next14Deficit} mm. Apply light life-saving irrigation if available, especially during ${currentStageEn}.`,
      body_mr: `पुढील १४ दिवसांत पिकाची पाण्याची गरज (${next14Etc} मिमी) अपेक्षित पावसापेक्षा (${next14Rain} मिमी) ${next14Deficit} मिमी जास्त आहे. उपलब्ध असल्यास ${currentStageMr} मध्ये हलके संरक्षणात्मक पाणी द्या.`,
      type: "RULE_BASED",
      source_note: "Engine 14-day ETc vs forecast rain rule",
    });
  } else if (next14Status === "MILD_DEFICIT") {
    guidance_cards.push({
      id: "moisture-conservation",
      title_en: "Conserve soil moisture",
      title_mr: "जमिनीतील ओलावा टिकवा",
      body_en: `Mild 14-day deficit (${next14Deficit} mm). Use organic mulch between rows and avoid unnecessary tillage to reduce soil evaporation.`,
      body_mr: `पुढील १४ दिवसांत सौम्य पाण्याची तूट (${next14Deficit} मिमी) आहे. बाष्पीभवन कमी करण्यासाठी सरींमध्ये आच्छादन (मल्चिंग) करा आणि अनावश्यक कोळपणी टाळा.`,
      type: "GENERAL_AGRONOMY",
      source_note: "General dryland agronomy practice",
    });
  } else {
    guidance_cards.push({
      id: "adequate-moisture",
      title_en: "Moisture outlook adequate",
      title_mr: "ओलाव्याची स्थिती समाधानकारक",
      body_en: `Expected rainfall (${next14Rain} mm) closely matches 14-day crop demand (${next14Etc} mm). Monitor field drainage if heavy showers occur.`,
      body_mr: `अपेक्षित पाऊस (${next14Rain} मिमी) पुढील १४ दिवसांच्या गरजेशी (${next14Etc} मिमी) सुसंगत आहे. जास्त पाऊस झाल्यास पाण्याचा निचरा तपासा.`,
      type: "RULE_BASED",
      source_note: "Engine 14-day ETc vs forecast rain rule",
    });
  }

  guidance_cards.push({
    id: "no-replacement-safety",
    title_en: "Standing-crop protection only",
    title_mr: "उभ्या पिकाचे संरक्षण — पीक बदलू नका",
    body_en: "Post-Sowing mode never recommends uprooting or replacing a standing crop. Focus on moisture conservation and stage-critical irrigation.",
    body_mr: "पेरणी नंतरच्या सल्ल्यामध्ये उभे पीक उपटून दुसरे पीक घेण्याचा सल्ला कधीही दिला जात नाही. ओलावा टिकवणे आणि संवेदनशील अवस्थेत पाणी देणे यावर भर द्या.",
    type: "RULE_BASED",
    source_note: "Jal-Krishi Post-Sowing safety rule",
  });

  return {
    crop_id: crop.id,
    name_en: crop.name_en,
    name_mr: crop.name_mr,
    days_since_sowing: daysSince,
    current_stage: currentStage,
    current_stage_label_en: currentStageEn,
    current_stage_label_mr: currentStageMr,
    next_14d_etc_mm: next14Etc,
    next_14d_forecast_rain_mm: next14Rain,
    next_14d_deficit_mm: next14Deficit,
    next_14d_status: next14Status,
    guidance_cards,
    cannot_decide_en: [
      "Actual root-zone soil moisture in your specific plot",
      "Pest, disease, or nutrient deficiency diagnosis",
      "Local canal or borewell pump availability",
    ],
    cannot_decide_mr: [
      "तुमच्या शेतातील जमिनीतील प्रत्यक्ष ओलावा",
      "कीड, रोग किंवा अन्नद्रव्यांची कमतरता",
      "स्थानिक कालवा किंवा बोअरवेलची प्रत्यक्ष पाणी उपलब्धता",
    ],
    weather_source_kind: weatherSourceKind,
    is_demonstration_scenario: isDemoScenario || weatherSourceKind === "OFFLINE_DEMO",
  };
}
