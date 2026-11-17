import type {
  ClimateScenario,
  ClimatologyFile,
  CropRecord,
  DailyWeatherPoint,
  StageBreakdown,
} from "../types";
import { addDays, dayOfYear, daysInMonth } from "./dates";

export interface DailyCropWeather {
  date: string;
  rain_mm: number;
  et0_mm: number;
  tmax_c: number;
  from_forecast: boolean;
}

/**
 * FAO-56 Kc curve:
 * - Initial stage: flat kc_ini
 * - Development stage: linear interpolation kc_ini -> kc_mid
 * - Mid-season stage: flat kc_mid
 * - Late-season stage: linear interpolation kc_mid -> kc_end
 */
export function getDailyKc(crop: CropRecord, dayIndex0: number): number {
  const [fIni, fDev, fMid, fLate] = crop.stage_fractions;
  const dIni = Math.max(1, Math.round(crop.duration_days * fIni));
  const dDev = Math.max(1, Math.round(crop.duration_days * fDev));
  const dMid = Math.max(1, Math.round(crop.duration_days * fMid));
  const dLate = Math.max(1, crop.duration_days - dIni - dDev - dMid);

  if (dayIndex0 < dIni) {
    return crop.kc_ini;
  }
  if (dayIndex0 < dIni + dDev) {
    const t = (dayIndex0 - dIni + 1) / dDev;
    return crop.kc_ini + t * (crop.kc_mid - crop.kc_ini);
  }
  if (dayIndex0 < dIni + dDev + dMid) {
    return crop.kc_mid;
  }
  const t = Math.min(1, (dayIndex0 - dIni - dDev - dMid + 1) / dLate);
  return crop.kc_mid + t * (crop.kc_end - crop.kc_mid);
}

/**
 * Monthly effective rainfall (FAO/AGLW formula):
 * Pe = 0.6 * P - 10 (if P < 70 mm) else 0.8 * P - 24, floored at 0.
 * For partial crop-window months, P is pro-rated by (days_in_window / days_in_month)
 * before applying Pe, then scaled back.
 */
export function monthlyEffectiveRainfall(totalMonthRainMm: number, daysInWindow: number, totalDaysInMonth: number): number {
  if (daysInWindow <= 0 || totalMonthRainMm <= 0) return 0;
  const fraction = Math.min(1, daysInWindow / totalDaysInMonth);
  const fullMonthEquivalentP = totalMonthRainMm / fraction;
  const fullMonthPe =
    fullMonthEquivalentP < 70
      ? Math.max(0, 0.6 * fullMonthEquivalentP - 10)
      : Math.max(0, 0.8 * fullMonthEquivalentP - 24);
  return fullMonthPe * fraction;
}

export function assembleCropWindowWeather(
  sowingDate: string,
  durationDays: number,
  forecastDays: DailyWeatherPoint[],
  climatology: ClimatologyFile,
  rainfallMultiplier = 1.0,
  et0Multiplier = 1.0,
  climateScenario: ClimateScenario = "NORMAL"
): DailyCropWeather[] {
  const forecastMap = new Map<string, DailyWeatherPoint>();
  for (const f of forecastDays) {
    forecastMap.set(f.date, f);
  }

  const climByDoy = new Map(climatology.days.map((d) => [d.doy, d]));
  const result: DailyCropWeather[] = [];

  for (let i = 0; i < durationDays; i++) {
    const date = addDays(sowingDate, i);
    const fc = forecastMap.get(date);
    if (fc) {
      result.push({
        date,
        rain_mm: Math.max(0, fc.rain_mm * rainfallMultiplier),
        et0_mm: Math.max(0, fc.et0_mm * et0Multiplier),
        tmax_c: fc.tmax_c,
        from_forecast: true,
      });
    } else {
      const doy = dayOfYear(date);
      const c = climByDoy.get(doy) ?? climatology.days[0];
      const baseRain =
        climateScenario === "DRY_P20"
          ? c.rain_mm_dry_p20
          : climateScenario === "WET_P80"
            ? c.rain_mm_wet_p80
            : c.rain_mm_mean;
      result.push({
        date,
        rain_mm: Math.max(0, baseRain * rainfallMultiplier),
        et0_mm: Math.max(0, c.et0_mm_mean * et0Multiplier),
        tmax_c: c.tmax_c_mean,
        from_forecast: false,
      });
    }
  }
  return result;
}

export function computeCropWaterBalance(
  crop: CropRecord,
  sowingDate: string,
  dailyWeather: DailyCropWeather[]
): {
  totalEtcMm: number;
  totalEffectiveRainMm: number;
  stages: StageBreakdown[];
  forecastCoverageDays: number;
  climatologyCoverageDays: number;
  heatStressDays: number;
} {
  const [fIni, fDev, fMid] = crop.stage_fractions;
  const dIni = Math.max(1, Math.round(crop.duration_days * fIni));
  const dDev = Math.max(1, Math.round(crop.duration_days * fDev));
  const dMid = Math.max(1, Math.round(crop.duration_days * fMid));

  const stageDefs: {
    stage: StageBreakdown["stage"];
    label_en: string;
    label_mr: string;
    startIdx: number;
    endIdx: number;
    is_critical: boolean;
  }[] = [
    { stage: "INITIAL", label_en: "Initial", label_mr: "सुरुवातीची अवस्था", startIdx: 0, endIdx: dIni - 1, is_critical: false },
    { stage: "DEVELOPMENT", label_en: "Development", label_mr: "वाढीची अवस्था", startIdx: dIni, endIdx: dIni + dDev - 1, is_critical: false },
    { stage: "MID", label_en: "Mid-season (Critical)", label_mr: "मध्य अवस्था (संवेदनशील)", startIdx: dIni + dDev, endIdx: dIni + dDev + dMid - 1, is_critical: true },
    { stage: "LATE", label_en: "Late-season", label_mr: "पक्वतेची अवस्था", startIdx: dIni + dDev + dMid, endIdx: crop.duration_days - 1, is_critical: false },
  ];

  // Monthly effective rainfall across the crop window
  const monthBuckets = new Map<string, { rain: number; days: number }>();
  for (const w of dailyWeather) {
    const ym = w.date.slice(0, 7);
    const b = monthBuckets.get(ym) ?? { rain: 0, days: 0 };
    b.rain += w.rain_mm;
    b.days += 1;
    monthBuckets.set(ym, b);
  }

  let totalEffectiveRainMm = 0;
  const monthEffRatio = new Map<string, number>();
  for (const [ym, b] of monthBuckets.entries()) {
    const [y, m] = ym.split("-").map(Number);
    const pe = monthlyEffectiveRainfall(b.rain, b.days, daysInMonth(y, m));
    totalEffectiveRainMm += pe;
    monthEffRatio.set(ym, b.rain > 0 ? pe / b.rain : 0);
  }

  let totalEtcMm = 0;
  let forecastCoverageDays = 0;
  let climatologyCoverageDays = 0;
  let heatStressDays = 0;

  const stages: StageBreakdown[] = stageDefs.map((sd) => {
    let stageEtc = 0;
    let stagePe = 0;
    for (let i = sd.startIdx; i <= sd.endIdx && i < dailyWeather.length; i++) {
      const w = dailyWeather[i];
      const kc = getDailyKc(crop, i);
      const etc = kc * w.et0_mm;
      stageEtc += etc;
      totalEtcMm += etc;

      const ym = w.date.slice(0, 7);
      stagePe += w.rain_mm * (monthEffRatio.get(ym) ?? 0);

      if (w.from_forecast) forecastCoverageDays++;
      else climatologyCoverageDays++;

      if (w.tmax_c > crop.tmax_stress_c) heatStressDays++;
    }
    return {
      stage: sd.stage,
      label_en: sd.label_en,
      label_mr: sd.label_mr,
      start_date: addDays(sowingDate, sd.startIdx),
      end_date: addDays(sowingDate, Math.min(sd.endIdx, dailyWeather.length - 1)),
      days: Math.max(0, sd.endIdx - sd.startIdx + 1),
      etc_mm: Number(stageEtc.toFixed(1)),
      effective_rain_mm: Number(stagePe.toFixed(1)),
      is_critical: sd.is_critical,
    };
  });

  return {
    totalEtcMm: Number(totalEtcMm.toFixed(1)),
    totalEffectiveRainMm: Number(totalEffectiveRainMm.toFixed(1)),
    stages,
    forecastCoverageDays,
    climatologyCoverageDays,
    heatStressDays,
  };
}
