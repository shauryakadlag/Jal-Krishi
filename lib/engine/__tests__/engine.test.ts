import { describe, expect, it } from "vitest";
import { runAnalysis } from "../analyze";
import { getDailyKc, monthlyEffectiveRainfall } from "../waterBalance";
import {
  CROPS,
  ENGINE_CONFIG,
  getGroundwaterForLocation,
  getLocationById,
} from "../../data";
import { getClimatology } from "../../data/climatology";
import fallbackWeather from "../../../data/fallbackWeather.json";
import type { WeatherBundle } from "../../types";

function makeDemoWeather(locationId: string): WeatherBundle {
  const locData =
    fallbackWeather.locations[locationId as keyof typeof fallbackWeather.locations];
  return {
    location_id: locationId,
    source_kind: "OFFLINE_DEMO",
    fetched_at: fallbackWeather.sample_date,
    timezone: "Asia/Kolkata",
    forecast_days: locData.forecast_days,
    source_label_en: "Offline Demonstration Sample",
    source_label_mr: "ऑफलाइन नमुना हवामान",
  };
}

describe("Jal-Krishi Deterministic Engine", () => {
  it("T1: produces identical results for identical inputs", () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");
    const weather = makeDemoWeather("latur");
    const clim = getClimatology("latur");

    const input = {
      location_id: "latur",
      season: "RABI" as const,
      mode: "PRE_SOWING" as const,
      sowing_date: "2026-11-17",
      irrigation_access: "LIMITED" as const,
    };

    const a = runAnalysis({
      input,
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather,
      climatology: clim,
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const b = runAnalysis({
      input,
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather,
      climatology: clim,
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    expect(a.pre_sowing?.ranked_crops).toEqual(b.pre_sowing?.ranked_crops);
  });

  it("T3: Semi-Critical Latur (Kharif June sowing) ranks Bajra above Sugarcane via computed water gap", () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");
    expect(gw.category).toBe("SEMI_CRITICAL");

    const res = runAnalysis({
      input: {
        location_id: "latur",
        season: "KHARIF",
        mode: "PRE_SOWING",
        sowing_date: "2026-06-20",
        irrigation_access: "RAINFED",
        is_demo_scenario: true,
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather: makeDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const ranked = res.pre_sowing!.ranked_crops;
    const bajraIdx = ranked.findIndex((c) => c.crop_id === "bajra");
    const sugarcaneIdx = ranked.findIndex((c) => c.crop_id === "sugarcane");

    expect(bajraIdx).toBeGreaterThanOrEqual(0);
    expect(sugarcaneIdx).toBeGreaterThanOrEqual(0);
    expect(bajraIdx).toBeLessThan(sugarcaneIdx);
    expect(ranked[bajraIdx].water_gap_mm).toBeLessThan(ranked[sugarcaneIdx].water_gap_mm);
  });

  it("T3 companion: Limited irrigation gives lower reliable irrigation for SEMI_CRITICAL than SAFE", () => {
    const latur = getLocationById("latur")!;
    const nagpur = getLocationById("nagpur")!;
    const gwLatur = getGroundwaterForLocation("latur");
    const gwNagpur = getGroundwaterForLocation("nagpur");

    const resLatur = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "PRE_SOWING",
        sowing_date: "2026-11-17",
        irrigation_access: "LIMITED",
      },
      location: latur,
      groundwater: gwLatur,
      crops: CROPS,
      weather: makeDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const resNagpur = runAnalysis({
      input: {
        location_id: "nagpur",
        season: "RABI",
        mode: "PRE_SOWING",
        sowing_date: "2026-11-17",
        irrigation_access: "LIMITED",
      },
      location: nagpur,
      groundwater: gwNagpur,
      crops: CROPS,
      weather: makeDemoWeather("nagpur"),
      climatology: getClimatology("nagpur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const laturCrop = resLatur.pre_sowing!.ranked_crops[0];
    const nagpurCrop = resNagpur.pre_sowing!.ranked_crops[0];

    expect(laturCrop.nominal_irrigation_mm).toBe(150);
    expect(nagpurCrop.nominal_irrigation_mm).toBe(150);
    expect(laturCrop.reliable_irrigation_mm).toBe(105);
    expect(nagpurCrop.reliable_irrigation_mm).toBe(150);
    expect(laturCrop.reliable_irrigation_mm).toBeLessThan(nagpurCrop.reliable_irrigation_mm);
  });

  it("T10: Unknown groundwater sets reliable irrigation to 0 and lowers confidence", () => {
    const loc = getLocationById("latur")!;
    const unknownGw = getGroundwaterForLocation("unknown_taluka");
    expect(unknownGw.category).toBe("UNKNOWN");

    const res = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "PRE_SOWING",
        sowing_date: "2026-11-17",
        irrigation_access: "ASSURED",
      },
      location: loc,
      groundwater: unknownGw,
      crops: CROPS,
      weather: makeDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    expect(res.pre_sowing!.ranked_crops[0].reliable_irrigation_mm).toBe(0);
    expect(res.confidence.level).toBe("LOW");
  });

  it("T11: Post-Sowing mode returns protective guidance and never ranks crops", () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");

    const res = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "POST_SOWING",
        sowing_date: "2026-11-01",
        irrigation_access: "LIMITED",
        standing_crop_id: "gram",
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather: makeDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    expect(res.pre_sowing).toBeUndefined();
    expect(res.post_sowing).toBeDefined();
    expect(res.post_sowing!.crop_id).toBe("gram");
    expect(res.post_sowing!.guidance_cards.some((g) => g.id === "no-replacement-safety")).toBe(true);
  });

  it("handles unsupported standing_crop_id gracefully in Post-Sowing by falling back to season crop", () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");

    const res = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "POST_SOWING",
        sowing_date: "2026-11-01",
        irrigation_access: "LIMITED",
        standing_crop_id: "nonexistent_crop",
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather: makeDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    expect(res.post_sowing).toBeDefined();
    expect(res.post_sowing!.crop_id).toBe("gram");
  });

  it("FAO-56 Kc transitions linearly in development and late stages", () => {
    const soybean = CROPS.find((c) => c.id === "soybean")!;
    expect(getDailyKc(soybean, 0)).toBeCloseTo(soybean.kc_ini, 4);
    expect(getDailyKc(soybean, 50)).toBeCloseTo(soybean.kc_mid, 4);
    expect(getDailyKc(soybean, soybean.duration_days - 1)).toBeCloseTo(soybean.kc_end, 4);
  });

  it("pro-rates partial crop-window months in monthlyEffectiveRainfall", () => {
    const fullMonth = monthlyEffectiveRainfall(100, 30, 30);
    const halfMonth = monthlyEffectiveRainfall(50, 15, 30);
    expect(fullMonth).toBeCloseTo(56, 2);
    expect(halfMonth).toBeCloseTo(28, 2);
  });

  it("What-If rainfall multiplier and DRY_P20/WET_P80 scenarios recalculate water gap", () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");
    const weather = makeDemoWeather("latur");
    const clim = getClimatology("latur");

    const dry = runAnalysis({
      input: {
        location_id: "latur",
        season: "KHARIF",
        mode: "PRE_SOWING",
        sowing_date: "2026-06-20",
        irrigation_access: "RAINFED",
        climate_scenario: "DRY_P20",
        rainfall_multiplier: 0.7,
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather,
      climatology: clim,
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const wet = runAnalysis({
      input: {
        location_id: "latur",
        season: "KHARIF",
        mode: "PRE_SOWING",
        sowing_date: "2026-06-20",
        irrigation_access: "RAINFED",
        climate_scenario: "WET_P80",
        rainfall_multiplier: 1.3,
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather,
      climatology: clim,
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const drySoy = dry.pre_sowing!.ranked_crops.find((c) => c.crop_id === "soybean")!;
    const wetSoy = wet.pre_sowing!.ranked_crops.find((c) => c.crop_id === "soybean")!;
    expect(drySoy.water_gap_mm).toBeGreaterThan(wetSoy.water_gap_mm);
    expect(drySoy.robustness.level).toBeDefined();
  });
});
