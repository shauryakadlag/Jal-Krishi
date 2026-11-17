import type {
  AnalysisInput,
  AnalysisOutput,
  ClimatologyFile,
  CropAnalysisResult,
  CropRecord,
  EngineConfig,
  GroundwaterRecord,
  LocationRecord,
  WeatherBundle,
} from "../types";
import {
  CATALOGUE_VERSION,
  CONFIG_VERSION,
  ENGINE_VERSION,
} from "../versions";
import {
  assembleCropWindowWeather,
  computeCropWaterBalance,
} from "./waterBalance";
import {
  computeConfidence,
  computeRobustnessLevel,
  scoreCrop,
} from "./scoring";
import { runPostSowingAnalysis } from "./postSowing";

export function runAnalysis(params: {
  input: AnalysisInput;
  location: LocationRecord;
  groundwater: GroundwaterRecord;
  crops: CropRecord[];
  weather: WeatherBundle;
  climatology: ClimatologyFile;
  config: EngineConfig;
  referenceDate?: string;
}): AnalysisOutput {
  const {
    input,
    location,
    groundwater,
    crops,
    weather,
    climatology,
    config,
    referenceDate = weather.forecast_days[0]?.date ?? input.sowing_date,
  } = params;

  const rainfallMult = input.rainfall_multiplier ?? 1.0;
  const climateScenario = input.climate_scenario ?? "NORMAL";
  const isDemoScenario =
    Boolean(input.is_demo_scenario) || weather.source_kind === "OFFLINE_DEMO";

  const confidence = computeConfidence({
    weatherSourceKind: weather.source_kind,
    groundwaterCategory: groundwater.category,
    climatologyIsFallback: climatology.is_fallback_sample,
  });

  const baseOutput: Omit<AnalysisOutput, "pre_sowing" | "post_sowing"> = {
    engine_version: ENGINE_VERSION,
    catalogue_version: CATALOGUE_VERSION,
    config_version: CONFIG_VERSION,
    climatology_version: climatology.climatology_version,
    analyzed_at: new Date().toISOString(),
    input,
    location,
    groundwater,
    weather_status: {
      source_kind: weather.source_kind,
      fetched_at: weather.fetched_at,
      source_label_en: weather.source_label_en,
      source_label_mr: weather.source_label_mr,
      is_live_forecast: weather.source_kind === "LIVE",
    },
    confidence,
    is_demo_scenario: isDemoScenario,
  };

  if (input.mode === "POST_SOWING") {
    const standingCrop =
      crops.find((c) => c.id === input.standing_crop_id) ??
      crops.find((c) => c.season === input.season) ??
      crops[0];

    const postSowing = runPostSowingAnalysis({
      crop: standingCrop,
      sowingDate: input.sowing_date,
      referenceDate,
      forecastDays: weather.forecast_days,
      weatherSourceKind: weather.source_kind,
      isDemoScenario,
    });

    return {
      ...baseOutput,
      post_sowing: postSowing,
    };
  }

  // PRE_SOWING: evaluate all crops in the selected season
  const seasonCrops = crops.filter((c) => c.season === input.season);

  const evaluateAll = (rMult: number, eMult: number) => {
    const list = seasonCrops.map((crop) => {
      const daily = assembleCropWindowWeather(
        input.sowing_date,
        crop.duration_days,
        weather.forecast_days,
        climatology,
        rMult,
        eMult,
        climateScenario
      );
      const wb = computeCropWaterBalance(crop, input.sowing_date, daily);
      return scoreCrop({
        crop,
        sowingDate: input.sowing_date,
        irrigationAccess: input.irrigation_access,
        groundwaterCategory: groundwater.category,
        totalEtcMm: wb.totalEtcMm,
        totalEffectiveRainMm: wb.totalEffectiveRainMm,
        stages: wb.stages,
        forecastCoverageDays: wb.forecastCoverageDays,
        climatologyCoverageDays: wb.climatologyCoverageDays,
        heatStressDays: wb.heatStressDays,
        config,
      });
    });
    list.sort((a, b) => b.scores.total - a.scores.total);
    return list;
  };

  const baseline = evaluateAll(rainfallMult, 1.0);
  const minus20Rain = evaluateAll(rainfallMult * 0.8, 1.0);
  const plus20Et0 = evaluateAll(rainfallMult, 1.2);

  const rankMapMinus20 = new Map(minus20Rain.map((c, idx) => [c.crop_id, idx + 1]));
  const rankMapPlus20 = new Map(plus20Et0.map((c, idx) => [c.crop_id, idx + 1]));

  const ranked_crops: CropAnalysisResult[] = baseline.map((item, idx) => {
    const baseRank = idx + 1;
    const rMinus = rankMapMinus20.get(item.crop_id) ?? baseRank;
    const rPlus = rankMapPlus20.get(item.crop_id) ?? baseRank;
    const maxShift = Math.max(Math.abs(rMinus - baseRank), Math.abs(rPlus - baseRank));
    return {
      ...item,
      robustness: {
        level: computeRobustnessLevel(maxShift),
        rank_under_minus20_rain: rMinus,
        rank_under_plus20_et0: rPlus,
        max_rank_shift: maxShift,
      },
    };
  });

  return {
    ...baseOutput,
    pre_sowing: {
      ranked_crops,
    },
  };
}
