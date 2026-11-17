export type VerificationStatus =
  | "VERIFIED_OFFICIAL"
  | "UNVALIDATED_PROTOTYPE_ASSUMPTION";

export type Season = "KHARIF" | "RABI";
export type Mode = "PRE_SOWING" | "POST_SOWING";
export type IrrigationAccess = "RAINFED" | "LIMITED" | "ASSURED";
export type GroundwaterCategory =
  | "SAFE"
  | "SEMI_CRITICAL"
  | "CRITICAL"
  | "OVER_EXPLOITED"
  | "UNKNOWN";

export type SuitabilityBand =
  | "BETTER_SUITED"
  | "POSSIBLE_WITH_CAUTION"
  | "HIGH_WATER_RISK";

export type WaterRiskLevel = "LOW" | "MODERATE" | "HIGH" | "SEVERE";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type RobustnessLevel = "ROBUST" | "MODERATE" | "SENSITIVE";
export type WeatherSourceKind = "LIVE" | "CACHED" | "OFFLINE_DEMO";
export type ClimateScenario = "NORMAL" | "DRY_P20" | "WET_P80";

export interface LocationRecord {
  id: string;
  name_en: string;
  name_mr: string;
  district_en: string;
  district_mr: string;
  taluka_en: string;
  taluka_mr: string;
  lat: number;
  lon: number;
  agro_zone_en: string;
  agro_zone_mr: string;
  verification_status: VerificationStatus;
}

export interface GroundwaterRecord {
  location_id: string;
  assessment_unit: string;
  district: string;
  category: GroundwaterCategory;
  stage_of_extraction_pct: number | null;
  geographic_level: "TALUKA_ASSESSMENT_UNIT" | "DISTRICT" | "UNAVAILABLE";
  report_title: string;
  assessment_year: string;
  published_date: string;
  agency: string;
  page_or_table: string;
  retrieved_on: string;
  verification_status: VerificationStatus;
  missing_reason?: string;
}

export interface CropRecord {
  id: string;
  name_en: string;
  name_mr: string;
  season: Season;
  duration_days: number;
  kc_ini: number;
  kc_mid: number;
  kc_end: number;
  stage_fractions: [number, number, number, number]; // [ini, dev, mid, late]
  sowing_window_start_mmdd: string; // e.g. "06-15"
  sowing_window_end_mmdd: string;   // e.g. "07-15"
  tmax_stress_c: number;
  heat_sensitivity: "LOW" | "MEDIUM" | "HIGH";
  fao56_cross_check_note: string;
  verification_status: VerificationStatus;
}

export interface EngineConfig {
  config_version: string;
  verification_status: VerificationStatus;
  weights: {
    water_fit: number;
    stage_fit: number;
    season_fit: number;
    heat_fit: number;
  };
  irrigation_nominal_mm: Record<IrrigationAccess, number>;
  groundwater_reliability: Record<GroundwaterCategory, number>;
  suitability_bands: {
    better_suited_min: number;
    possible_min: number;
  };
  water_risk_thresholds: {
    low_max: number;
    moderate_max: number;
    high_max: number;
  };
  litres_per_mm_per_acre: number;
}

export interface DailyWeatherPoint {
  date: string; // YYYY-MM-DD
  rain_mm: number;
  et0_mm: number;
  tmax_c: number;
  tmin_c?: number;
  precip_prob_pct?: number;
}

export interface WeatherBundle {
  location_id: string;
  source_kind: WeatherSourceKind;
  fetched_at: string; // ISO timestamp
  timezone: string;
  forecast_days: DailyWeatherPoint[];
  source_label_en: string;
  source_label_mr: string;
}

export interface ClimatologyDay {
  doy: number; // 1..365
  rain_mm_mean: number;
  et0_mm_mean: number;
  tmax_c_mean: number;
  rain_mm_dry_p20: number;
  rain_mm_wet_p80: number;
}

export interface ClimatologyFile {
  location_id: string;
  climatology_version: string;
  source: string;
  period: string;
  p20_p80_method: string;
  is_fallback_sample: boolean;
  days: ClimatologyDay[];
}

export interface StageBreakdown {
  stage: "INITIAL" | "DEVELOPMENT" | "MID" | "LATE";
  label_en: string;
  label_mr: string;
  start_date: string;
  end_date: string;
  days: number;
  etc_mm: number;
  effective_rain_mm: number;
  is_critical: boolean;
}

export interface CropAnalysisResult {
  crop_id: string;
  name_en: string;
  name_mr: string;
  duration_days: number;
  verification_status: VerificationStatus;
  water_demand_etc_mm: number;
  effective_rain_mm: number;
  nominal_irrigation_mm: number;
  reliable_irrigation_mm: number;
  water_gap_mm: number;
  water_gap_litres_per_acre: number;
  gap_ratio: number;
  water_risk: WaterRiskLevel;
  scores: {
    water_fit: number;
    stage_fit: number;
    season_fit: number;
    heat_fit: number;
    total: number;
  };
  band: SuitabilityBand;
  stages: StageBreakdown[];
  forecast_coverage_days: number;
  climatology_coverage_days: number;
  robustness: {
    level: RobustnessLevel;
    rank_under_minus20_rain?: number;
    rank_under_plus20_et0?: number;
    max_rank_shift: number;
  };
}

export interface PostSowingResult {
  crop_id: string;
  name_en: string;
  name_mr: string;
  days_since_sowing: number;
  current_stage: StageBreakdown["stage"];
  current_stage_label_en: string;
  current_stage_label_mr: string;
  next_14d_etc_mm: number;
  next_14d_forecast_rain_mm: number;
  next_14d_deficit_mm: number;
  next_14d_status: "ADEQUATE" | "MILD_DEFICIT" | "SEVERE_DEFICIT";
  guidance_cards: {
    id: string;
    title_en: string;
    title_mr: string;
    body_en: string;
    body_mr: string;
    type: "RULE_BASED" | "GENERAL_AGRONOMY";
    source_note: string;
  }[];
  cannot_decide_en: string[];
  cannot_decide_mr: string[];
  weather_source_kind: WeatherSourceKind;
  is_demonstration_scenario: boolean;
}

export interface AnalysisInput {
  location_id: string;
  season: Season;
  mode: Mode;
  sowing_date: string; // YYYY-MM-DD
  irrigation_access: IrrigationAccess;
  standing_crop_id?: string;
  rainfall_multiplier?: number; // default 1.0 (for what-if)
  climate_scenario?: ClimateScenario; // default NORMAL
  is_demo_scenario?: boolean;
}

export interface AnalysisOutput {
  engine_version: string;
  catalogue_version: string;
  config_version: string;
  climatology_version: string;
  analyzed_at: string;
  input: AnalysisInput;
  location: LocationRecord;
  groundwater: GroundwaterRecord;
  weather_status: {
    source_kind: WeatherSourceKind;
    fetched_at: string;
    source_label_en: string;
    source_label_mr: string;
    is_live_forecast: boolean;
  };
  confidence: {
    level: ConfidenceLevel;
    reasons_en: string[];
    reasons_mr: string[];
  };
  is_demo_scenario: boolean;
  pre_sowing?: {
    ranked_crops: CropAnalysisResult[];
  };
  post_sowing?: PostSowingResult;
}
