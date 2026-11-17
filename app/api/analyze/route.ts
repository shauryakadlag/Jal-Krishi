import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CROPS,
  ENGINE_CONFIG,
  getGroundwaterForLocation,
  getLocationById,
} from "@/lib/data";
import { getClimatology } from "@/lib/data/climatology";
import { runAnalysis } from "@/lib/engine/analyze";
import { fetchLiveForecast, getOfflineDemoWeather } from "@/lib/adapters/openMeteo";
import type { WeatherBundle } from "@/lib/types";

const CachedWeatherSchema = z.object({
  location_id: z.string(),
  fetched_at: z.string(),
  timezone: z.string(),
  forecast_days: z.array(
    z.object({
      date: z.string(),
      rain_mm: z.number(),
      et0_mm: z.number(),
      tmax_c: z.number(),
      tmin_c: z.number().optional(),
      precip_prob_pct: z.number().optional(),
    })
  ),
});

const AnalyzeRequestSchema = z.object({
  location_id: z.string().min(1),
  season: z.enum(["KHARIF", "RABI"]),
  mode: z.enum(["PRE_SOWING", "POST_SOWING"]),
  sowing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  irrigation_access: z.enum(["RAINFED", "LIMITED", "ASSURED"]),
  standing_crop_id: z.string().optional(),
  rainfall_multiplier: z.number().min(0.4).max(1.8).optional(),
  climate_scenario: z.enum(["NORMAL", "DRY_P20", "WET_P80"]).optional(),
  is_demo_scenario: z.boolean().optional(),
  simulate_offline: z.boolean().optional(),
  cached_weather: CachedWeatherSchema.optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const location = getLocationById(data.location_id);
    if (!location) {
      return NextResponse.json({ error: "Unknown location_id" }, { status: 404 });
    }

    const groundwater = getGroundwaterForLocation(location.id);
    const climatology = getClimatology(location.id);

    // 1. Live -> 2. Cached last-live -> 3. Offline Demonstration Mode
    let weather: WeatherBundle | null = await fetchLiveForecast(
      location,
      Boolean(data.simulate_offline)
    );

    if (!weather && data.cached_weather && data.cached_weather.location_id === location.id && !data.simulate_offline) {
      weather = {
        location_id: location.id,
        source_kind: "CACHED",
        fetched_at: data.cached_weather.fetched_at,
        timezone: data.cached_weather.timezone,
        forecast_days: data.cached_weather.forecast_days,
        source_label_en: `Cached weather from ${data.cached_weather.fetched_at.slice(0, 16).replace("T", " ")}`,
        source_label_mr: `पूर्वी साठवलेले हवामान (${data.cached_weather.fetched_at.slice(0, 10)})`,
      };
    }

    if (!weather) {
      weather = getOfflineDemoWeather(location.id);
    }

    const result = runAnalysis({
      input: {
        location_id: data.location_id,
        season: data.season,
        mode: data.mode,
        sowing_date: data.sowing_date,
        irrigation_access: data.irrigation_access,
        standing_crop_id: data.standing_crop_id,
        rainfall_multiplier: data.rainfall_multiplier,
        climate_scenario: data.climate_scenario,
        is_demo_scenario: data.is_demo_scenario,
      },
      location,
      groundwater,
      crops: CROPS,
      weather,
      climatology,
      config: ENGINE_CONFIG,
    });

    return NextResponse.json({
      analysis: result,
      weather_bundle: weather.source_kind === "LIVE" ? weather : undefined,
    });
  } catch (err) {
    console.error("/api/analyze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
