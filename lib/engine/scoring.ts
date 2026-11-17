import type {
  ConfidenceLevel,
  CropAnalysisResult,
  CropRecord,
  EngineConfig,
  GroundwaterCategory,
  IrrigationAccess,
  RobustnessLevel,
  SuitabilityBand,
  WaterRiskLevel,
  WeatherSourceKind,
} from "../types";
import { isWithinSowingWindow } from "./dates";

export function computeWaterRisk(gapRatio: number, config: EngineConfig): WaterRiskLevel {
  if (gapRatio < config.water_risk_thresholds.low_max) return "LOW";
  if (gapRatio < config.water_risk_thresholds.moderate_max) return "MODERATE";
  if (gapRatio < config.water_risk_thresholds.high_max) return "HIGH";
  return "SEVERE";
}

export function computeSuitabilityBand(score: number, config: EngineConfig): SuitabilityBand {
  if (score >= config.suitability_bands.better_suited_min) return "BETTER_SUITED";
  if (score >= config.suitability_bands.possible_min) return "POSSIBLE_WITH_CAUTION";
  return "HIGH_WATER_RISK";
}

export function scoreCrop(params: {
  crop: CropRecord;
  sowingDate: string;
  irrigationAccess: IrrigationAccess;
  groundwaterCategory: GroundwaterCategory;
  totalEtcMm: number;
  totalEffectiveRainMm: number;
  stages: CropAnalysisResult["stages"];
  forecastCoverageDays: number;
  climatologyCoverageDays: number;
  heatStressDays: number;
  config: EngineConfig;
}): Omit<CropAnalysisResult, "robustness"> {
  const {
    crop,
    sowingDate,
    irrigationAccess,
    groundwaterCategory,
    totalEtcMm,
    totalEffectiveRainMm,
    stages,
    forecastCoverageDays,
    climatologyCoverageDays,
    heatStressDays,
    config,
  } = params;

  const nominalIrr = config.irrigation_nominal_mm[irrigationAccess];
  const reliability = config.groundwater_reliability[groundwaterCategory];
  const reliableIrr = Number((nominalIrr * reliability).toFixed(1));

  const waterGapMm = Number(
    Math.max(0, totalEtcMm - totalEffectiveRainMm - reliableIrr).toFixed(1)
  );
  const gapRatio = totalEtcMm > 0 ? Number((waterGapMm / totalEtcMm).toFixed(3)) : 0;
  const waterGapLitresPerAcre = Math.round(waterGapMm * config.litres_per_mm_per_acre);

  // 1. WaterFit (0..100)
  const waterFit = Math.max(0, Math.min(100, Math.round((1 - gapRatio) * 100)));

  // 2. StageFit (0..100): critical mid-season coverage
  const midStage = stages.find((s) => s.is_critical);
  let stageFit = 100;
  if (midStage && midStage.etc_mm > 0) {
    const midShareIrr = reliableIrr * 0.5;
    const midRatio = Math.min(1, (midStage.effective_rain_mm + midShareIrr) / midStage.etc_mm);
    stageFit = Math.round(midRatio * 100);
  }

  // 3. SeasonFit (0..100): sowing window alignment
  const win = isWithinSowingWindow(
    sowingDate,
    crop.sowing_window_start_mmdd,
    crop.sowing_window_end_mmdd
  );
  const seasonFit = win.inWindow ? 100 : Math.max(20, Math.round(100 - win.daysOutside * 1.5));

  // 4. HeatFit (0..100): penalty for days above tmax_stress_c
  const penaltyPerDay =
    crop.heat_sensitivity === "HIGH" ? 2.5 : crop.heat_sensitivity === "MEDIUM" ? 1.5 : 0.8;
  const heatFit = Math.max(0, Math.min(100, Math.round(100 - heatStressDays * penaltyPerDay)));

  const total = Math.round(
    waterFit * config.weights.water_fit +
      stageFit * config.weights.stage_fit +
      seasonFit * config.weights.season_fit +
      heatFit * config.weights.heat_fit
  );

  return {
    crop_id: crop.id,
    name_en: crop.name_en,
    name_mr: crop.name_mr,
    duration_days: crop.duration_days,
    verification_status: crop.verification_status,
    water_demand_etc_mm: totalEtcMm,
    effective_rain_mm: totalEffectiveRainMm,
    nominal_irrigation_mm: nominalIrr,
    reliable_irrigation_mm: reliableIrr,
    water_gap_mm: waterGapMm,
    water_gap_litres_per_acre: waterGapLitresPerAcre,
    gap_ratio: gapRatio,
    water_risk: computeWaterRisk(gapRatio, config),
    scores: {
      water_fit: waterFit,
      stage_fit: stageFit,
      season_fit: seasonFit,
      heat_fit: heatFit,
      total,
    },
    band: computeSuitabilityBand(total, config),
    stages,
    forecast_coverage_days: forecastCoverageDays,
    climatology_coverage_days: climatologyCoverageDays,
  };
}

export function computeRobustnessLevel(maxRankShift: number): RobustnessLevel {
  if (maxRankShift <= 1) return "ROBUST";
  if (maxRankShift <= 2) return "MODERATE";
  return "SENSITIVE";
}

export function computeConfidence(params: {
  weatherSourceKind: WeatherSourceKind;
  groundwaterCategory: GroundwaterCategory;
  climatologyIsFallback: boolean;
}): { level: ConfidenceLevel; reasons_en: string[]; reasons_mr: string[] } {
  const reasons_en: string[] = [];
  const reasons_mr: string[] = [];
  let score = 3;

  if (params.weatherSourceKind === "OFFLINE_DEMO") {
    score -= 2;
    reasons_en.push("Using Offline Demonstration sample weather instead of live forecast.");
    reasons_mr.push("थेट हवामान अंदाजाऐवजी ऑफलाइन नमुना हवामान डेटा वापरला आहे.");
  } else if (params.weatherSourceKind === "CACHED") {
    score -= 1;
    reasons_en.push("Using cached last-live weather; live forecast was unavailable.");
    reasons_mr.push("थेट हवामान उपलब्ध नसल्याने पूर्वी साठवलेला हवामान डेटा वापरला आहे.");
  }

  if (params.groundwaterCategory === "UNKNOWN") {
    score -= 1;
    reasons_en.push("Verified groundwater record unavailable; irrigation credit set to 0.");
    reasons_mr.push("प्रमाणित भूजल नोंद उपलब्ध नसल्याने सिंचन विश्वासार्हता ० धरली आहे.");
  }

  if (params.climatologyIsFallback) {
    score -= 1;
    reasons_en.push("Using prototype fallback climatology instead of ERA5-Land historical archive.");
    reasons_mr.push("ऐतिहासिक ERA5-Land डेटाऐवजी नमुना हवामान सरासरी वापरली आहे.");
  }

  if (reasons_en.length === 0) {
    reasons_en.push("Live forecast + verified GSDA 2023 groundwater baseline.");
    reasons_mr.push("थेट हवामान अंदाज आणि प्रमाणित GSDA २०२३ भूजल नोंद उपलब्ध आहे.");
  }

  const level: ConfidenceLevel = score >= 3 ? "HIGH" : score === 2 ? "MEDIUM" : "LOW";
  return { level, reasons_en, reasons_mr };
}
