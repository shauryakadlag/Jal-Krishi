import type { AnalysisOutput, WeatherBundle } from "./types";

const WEATHER_KEY_PREFIX = "jal_krishi_weather_";
const HISTORY_KEY = "jal_krishi_history_v1";

export interface HistorySnapshot {
  id: string;
  saved_at: string;
  analysis: AnalysisOutput;
}

export function saveCachedWeather(bundle: WeatherBundle): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${WEATHER_KEY_PREFIX}${bundle.location_id}`,
      JSON.stringify(bundle)
    );
  } catch {
    // ignore quota errors
  }
}

export function loadCachedWeather(locationId: string): WeatherBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${WEATHER_KEY_PREFIX}${locationId}`);
    if (!raw) return null;
    return JSON.parse(raw) as WeatherBundle;
  } catch {
    return null;
  }
}

export function loadHistory(): HistorySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistorySnapshot[];
  } catch {
    return [];
  }
}

export function saveHistorySnapshot(analysis: AnalysisOutput): HistorySnapshot[] {
  if (typeof window === "undefined") return [];
  const existing = loadHistory();
  const snapshot: HistorySnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    saved_at: new Date().toISOString(),
    analysis,
  };
  const updated = [snapshot, ...existing].slice(0, 25);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}
