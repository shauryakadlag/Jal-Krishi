import { describe, expect, it } from "vitest";
import { fetchLiveForecast, getOfflineDemoWeather } from "../openMeteo";
import { generateMarathiChatAnswer, generateMarathiExplanation } from "../gemini";
import { CROPS, ENGINE_CONFIG, getGroundwaterForLocation, getLocationById } from "../../data";
import { getClimatology } from "../../data/climatology";
import { runAnalysis } from "../../engine/analyze";

describe("Adapters & Fallbacks", () => {
  it("returns null on simulated live forecast failure and provides labelled offline demo weather", async () => {
    const loc = getLocationById("latur")!;
    const live = await fetchLiveForecast(loc, true);
    expect(live).toBeNull();

    const demo = getOfflineDemoWeather("latur");
    expect(demo.source_kind).toBe("OFFLINE_DEMO");
    expect(demo.forecast_days.length).toBeGreaterThanOrEqual(14);
  });

  it("Gemini explainer falls back to Marathi template when GEMINI_API_KEY is absent", async () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");
    const analysis = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "PRE_SOWING",
        sowing_date: "2026-11-17",
        irrigation_access: "LIMITED",
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather: getOfflineDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const exp = await generateMarathiExplanation(analysis);
    expect(exp.used_fallback).toBe(true);
    expect(exp.summary_mr.length).toBeGreaterThan(10);
  });

  it("Gemini chat refuses off-topic pest/fertilizer/market questions with KVK referral", async () => {
    const loc = getLocationById("latur")!;
    const gw = getGroundwaterForLocation("latur");
    const analysis = runAnalysis({
      input: {
        location_id: "latur",
        season: "RABI",
        mode: "PRE_SOWING",
        sowing_date: "2026-11-17",
        irrigation_access: "LIMITED",
      },
      location: loc,
      groundwater: gw,
      crops: CROPS,
      weather: getOfflineDemoWeather("latur"),
      climatology: getClimatology("latur"),
      config: ENGINE_CONFIG,
      referenceDate: "2026-11-17",
    });

    const refused = await generateMarathiChatAnswer(
      "या पिकावर कीड पडली तर कोणते औषध फवारावे?",
      analysis
    );
    expect(refused.refused).toBe(true);
    expect(refused.answer_mr).toContain("KVK");

    const allowed = await generateMarathiChatAnswer(
      "पहिल्या क्रमांकाचे पीक का निवडले?",
      analysis
    );
    expect(allowed.refused).toBe(false);
    expect(allowed.answer_mr.length).toBeGreaterThan(10);
  });
});
