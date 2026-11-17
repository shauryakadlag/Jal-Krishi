import fallbackWeather from "../../data/fallbackWeather.json";
import type { DailyWeatherPoint, LocationRecord, WeatherBundle } from "../types";

export async function fetchLiveForecast(
  location: LocationRecord,
  simulateFailure = false
): Promise<WeatherBundle | null> {
  if (simulateFailure) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${location.lat}&longitude=${location.lon}` +
    `&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=16&timezone=Asia%2FKolkata`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);

    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        precipitation_sum?: (number | null)[];
        et0_fao_evapotranspiration?: (number | null)[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
        precipitation_probability_max?: (number | null)[];
      };
    };

    if (!json.daily?.time?.length) return null;

    const forecast_days: DailyWeatherPoint[] = json.daily.time.map((date, i) => ({
      date,
      rain_mm: json.daily!.precipitation_sum?.[i] ?? 0,
      et0_mm: json.daily!.et0_fao_evapotranspiration?.[i] ?? 4.0,
      tmax_c: json.daily!.temperature_2m_max?.[i] ?? 30,
      tmin_c: json.daily!.temperature_2m_min?.[i] ?? 18,
      precip_prob_pct: json.daily!.precipitation_probability_max?.[i] ?? 0,
    }));

    return {
      location_id: location.id,
      source_kind: "LIVE",
      fetched_at: new Date().toISOString(),
      timezone: "Asia/Kolkata",
      forecast_days,
      source_label_en: "Open-Meteo Live 16-day Forecast",
      source_label_mr: "Open-Meteo थेट १६-दिवसीय हवामान अंदाज",
    };
  } catch {
    return null;
  }
}

export function getOfflineDemoWeather(locationId: string): WeatherBundle {
  const locData =
    fallbackWeather.locations[locationId as keyof typeof fallbackWeather.locations] ??
    fallbackWeather.locations.latur;

  return {
    location_id: locationId,
    source_kind: "OFFLINE_DEMO",
    fetched_at: fallbackWeather.sample_date,
    timezone: "Asia/Kolkata",
    forecast_days: locData.forecast_days,
    source_label_en: "Offline Demonstration Sample (not live)",
    source_label_mr: "ऑफलाइन नमुना हवामान (थेट नाही)",
  };
}
