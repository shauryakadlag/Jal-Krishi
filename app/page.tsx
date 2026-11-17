"use client";

import { useEffect, useState } from "react";
import { CROPS, LOCATIONS } from "@/lib/data";
import type {
  AnalysisOutput,
  ClimateScenario,
  CropAnalysisResult,
  IrrigationAccess,
  Mode,
  Season,
} from "@/lib/types";
import type { ExplainOutput } from "@/lib/adapters/gemini";
import {
  loadCachedWeather,
  loadHistory,
  saveCachedWeather,
  saveHistorySnapshot,
  type HistorySnapshot,
} from "@/lib/storage";
import { ScoreWaterfallChart, WaterBalanceBarChart } from "@/components/Charts";

type Tab = "setup" | "results" | "detail" | "assistant" | "transparency" | "history";

export default function JalKrishiApp() {
  const [lang, setLang] = useState<"mr" | "en">("mr");
  const [tab, setTab] = useState<Tab>("setup");
  const [simulateOffline, setSimulateOffline] = useState(false);

  // Inputs
  const [locationId, setLocationId] = useState("latur");
  const [season, setSeason] = useState<Season>("RABI");
  const [mode, setMode] = useState<Mode>("PRE_SOWING");
  const [sowingDate, setSowingDate] = useState("2026-11-17");
  const [irrigationAccess, setIrrigationAccess] = useState<IrrigationAccess>("LIMITED");
  const [standingCropId, setStandingCropId] = useState("gram");
  const [rainfallMult, setRainfallMult] = useState(1.0);
  const [climateScenario, setClimateScenario] = useState<ClimateScenario>("NORMAL");
  const [isDemoScenario, setIsDemoScenario] = useState(false);

  // Results & AI
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisOutput | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplainOutput | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  // Assistant
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { q: string; a: string; refused: boolean }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  // History
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const seasonCrops = CROPS.filter((c) => c.season === season);
  useEffect(() => {
    if (!seasonCrops.some((c) => c.id === standingCropId)) {
      setStandingCropId(seasonCrops[0]?.id ?? "gram");
    }
  }, [season, standingCropId, seasonCrops]);

  async function runAnalyze(overrides?: {
    location_id?: string;
    season?: Season;
    mode?: Mode;
    sowing_date?: string;
    irrigation_access?: IrrigationAccess;
    standing_crop_id?: string;
    rainfall_multiplier?: number;
    climate_scenario?: ClimateScenario;
    is_demo_scenario?: boolean;
    saveToHistory?: boolean;
    goToResults?: boolean;
  }) {
    setLoading(true);
    setErrorMsg(null);
    const loc = overrides?.location_id ?? locationId;
    const cached = loadCachedWeather(loc);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: loc,
          season: overrides?.season ?? season,
          mode: overrides?.mode ?? mode,
          sowing_date: overrides?.sowing_date ?? sowingDate,
          irrigation_access: overrides?.irrigation_access ?? irrigationAccess,
          standing_crop_id: overrides?.standing_crop_id ?? standingCropId,
          rainfall_multiplier: overrides?.rainfall_multiplier ?? rainfallMult,
          climate_scenario: overrides?.climate_scenario ?? climateScenario,
          is_demo_scenario: overrides?.is_demo_scenario ?? isDemoScenario,
          simulate_offline: simulateOffline,
          cached_weather: cached ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Analysis failed");
        setLoading(false);
        return;
      }

      if (data.weather_bundle) {
        saveCachedWeather(data.weather_bundle);
      }

      const out = data.analysis as AnalysisOutput;
      setAnalysis(out);
      if (overrides?.saveToHistory !== false) {
        setHistory(saveHistorySnapshot(out));
      }
      if (overrides?.goToResults !== false) {
        setTab("results");
      }

      // Fetch Marathi explanation in background
      setExplainLoading(true);
      fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: out }),
      })
        .then((r) => r.json())
        .then((ex) => setExplanation(ex))
        .catch(() => setExplanation(null))
        .finally(() => setExplainLoading(false));
    } catch {
      setErrorMsg(
        lang === "mr"
          ? "नेटवर्क त्रुटी. कृपया पुन्हा प्रयत्न करा."
          : "Network error. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendChat(q: string) {
    if (!q.trim() || !analysis) return;
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, analysis }),
      });
      const data = await res.json();
      setChatHistory((prev) => [
        ...prev,
        { q, a: data.answer_mr ?? "उत्तर उपलब्ध नाही.", refused: Boolean(data.refused) },
      ]);
      setChatInput("");
    } finally {
      setChatLoading(false);
    }
  }

  const selectedCrop: CropAnalysisResult | undefined =
    analysis?.pre_sowing?.ranked_crops.find((c) => c.crop_id === selectedCropId) ??
    analysis?.pre_sowing?.ranked_crops[0];

  const bandBadge = (band: CropAnalysisResult["band"]) => {
    if (band === "BETTER_SUITED")
      return {
        cls: "bg-leaf-100 text-leaf-700 border-leaf-500",
        mr: "अधिक योग्य (≥70)",
        en: "Better suited (≥70)",
      };
    if (band === "POSSIBLE_WITH_CAUTION")
      return {
        cls: "bg-amberwarn-100 text-amberwarn-700 border-amberwarn-600",
        mr: "सावधगिरीने शक्य (40–69)",
        en: "Possible with caution (40–69)",
      };
    return {
      cls: "bg-risk-100 text-risk-700 border-risk-600",
      mr: "जास्त पाणी जोखीम (<40)",
      en: "High water risk (<40)",
    };
  };

  const riskBadge = (risk: CropAnalysisResult["water_risk"]) => {
    if (risk === "LOW") return { mr: "कमी (<15%)", en: "LOW (<15%)", cls: "text-leaf-700" };
    if (risk === "MODERATE") return { mr: "मध्यम (15–35%)", en: "MODERATE (15–35%)", cls: "text-amberwarn-700" };
    if (risk === "HIGH") return { mr: "जास्त (35–60%)", en: "HIGH (35–60%)", cls: "text-risk-700" };
    return { mr: "तीव्र (≥60%)", en: "SEVERE (≥60%)", cls: "text-risk-700 font-bold" };
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-leaf-50/70 via-soil-50 to-water-50/50">
      {/* Sticky Mobile-First Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-leaf-700 to-leaf-600 text-white shadow-md">
        <div className="max-w-2xl mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
            </h1>
            <p className="text-[11px] text-leaf-100">
              {lang === "mr"
                ? "पाणी-संतुलन पीक सल्लागार"
                : "Water-Balance Crop Advisor"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSimulateOffline((v) => !v)}
              className={`px-2 py-1 rounded text-xs font-medium border transition ${
                simulateOffline
                  ? "bg-amberwarn-600 border-amberwarn-100 text-white"
                  : "bg-leaf-600 border-leaf-500 text-leaf-100"
              }`}
              title="Toggle simulated API failure for Offline Mode demo"
            >
              {simulateOffline
                ? lang === "mr"
                  ? "ऑफलाइन सिम्युलेशन: चालू"
                  : "Offline Sim: ON"
                : lang === "mr"
                  ? "ऑफलाइन सिम्युलेशन"
                  : "Offline Sim"}
            </button>
            <button
              type="button"
              onClick={() => setLang((l) => (l === "mr" ? "en" : "mr"))}
              className="px-2.5 py-1 rounded bg-white text-leaf-700 text-xs font-bold shadow-sm"
            >
              {lang === "mr" ? "EN" : "मराठी"}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="max-w-2xl mx-auto px-2 pb-2 flex gap-1 overflow-x-auto text-xs">
          {(
            [
              ["setup", lang === "mr" ? "सेटअप" : "Setup"],
              ["results", lang === "mr" ? "निकाल" : "Results"],
              ["assistant", lang === "mr" ? "सहाय्यक" : "Assistant"],
              ["transparency", lang === "mr" ? "डेटा स्रोत" : "Sources"],
              ["history", lang === "mr" ? "इतिहास" : "History"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition ${
                tab === id || (tab === "detail" && id === "results")
                  ? "bg-white text-leaf-700 shadow"
                  : "bg-leaf-600/70 text-white hover:bg-leaf-600"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-3 py-4 space-y-4">
        {/* Global Offline / Demo Banner */}
        {analysis && analysis.weather_status.source_kind !== "LIVE" && (
          <div className="rounded-xl border border-amberwarn-600 bg-amberwarn-50 p-3 text-xs text-amberwarn-700">
            <p className="font-bold">
              {analysis.weather_status.source_kind === "OFFLINE_DEMO"
                ? lang === "mr"
                  ? "⚠️ ऑफलाइन प्रात्यक्षिक मोड (Offline Demonstration Mode)"
                  : "⚠️ Offline Demonstration Mode"
                : lang === "mr"
                  ? "ℹ️ साठवलेला हवामान डेटा (Cached Weather)"
                  : "ℹ️ Cached Weather Data"}
            </p>
            <p className="mt-0.5">
              {lang === "mr"
                ? analysis.weather_status.source_label_mr
                : analysis.weather_status.source_label_en}
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-risk-600 bg-risk-50 p-3 text-sm text-risk-700">
            {errorMsg}
          </div>
        )}

        {/* TAB 1: SETUP & INPUTS */}
        {tab === "setup" && (
          <div className="space-y-4">
            {/* Quick Demo Presets */}
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-2.5">
              <h2 className="text-sm font-bold text-soil-800">
                {lang === "mr"
                  ? "झटपट प्रात्यक्षिक (Quick Demo)"
                  : "Quick Demo Scenarios"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocationId("latur");
                    setSeason("KHARIF");
                    setMode("PRE_SOWING");
                    setSowingDate("2026-06-20");
                    setIrrigationAccess("RAINFED");
                    setIsDemoScenario(true);
                    runAnalyze({
                      location_id: "latur",
                      season: "KHARIF",
                      mode: "PRE_SOWING",
                      sowing_date: "2026-06-20",
                      irrigation_access: "RAINFED",
                      is_demo_scenario: true,
                    });
                  }}
                  className="text-left p-3 rounded-xl border border-leaf-500 bg-leaf-50 hover:bg-leaf-100 transition"
                >
                  <div className="text-xs font-bold text-leaf-700">
                    {lang === "mr"
                      ? "खरीप T3 प्रात्यक्षिक (लातूर, २० जून)"
                      : "Kharif T3 Demo (Latur, Jun 20)"}
                  </div>
                  <div className="text-[11px] text-soil-600 mt-0.5">
                    {lang === "mr"
                      ? "केवळ प्रात्यक्षिक सराव — निम-संवेदनशील भूजल"
                      : "Demonstration scenario — Semi-Critical GW"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocationId("baramati");
                    setSeason("RABI");
                    setMode("PRE_SOWING");
                    setSowingDate("2026-11-17");
                    setIrrigationAccess("LIMITED");
                    setIsDemoScenario(false);
                    runAnalyze({
                      location_id: "baramati",
                      season: "RABI",
                      mode: "PRE_SOWING",
                      sowing_date: "2026-11-17",
                      irrigation_access: "LIMITED",
                      is_demo_scenario: false,
                    });
                  }}
                  className="text-left p-3 rounded-xl border border-water-500 bg-water-50 hover:bg-water-100 transition"
                >
                  <div className="text-xs font-bold text-water-600">
                    {lang === "mr"
                      ? "सध्याचा रब्बी हंगाम (बारामती, आज)"
                      : "Current Rabi (Baramati, Today)"}
                  </div>
                  <div className="text-[11px] text-soil-600 mt-0.5">
                    {lang === "mr"
                      ? "पुढील १६ दिवस अंदाज + उर्वरित सरासरी"
                      : "16-day forecast + seasonal climatology"}
                  </div>
                </button>
              </div>
            </section>

            {/* Main Input Form */}
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-soil-900">
                {lang === "mr" ? "तुमची माहिती निवडा" : "Farm & Season Inputs"}
              </h2>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-soil-800 mb-1">
                  {lang === "mr" ? "तालुका / पायलट स्थान" : "Pilot Location"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LOCATIONS.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setLocationId(loc.id)}
                      className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition ${
                        locationId === loc.id
                          ? "bg-leaf-700 text-white border-leaf-700 shadow"
                          : "bg-soil-50 text-soil-800 border-soil-200"
                      }`}
                    >
                      {lang === "mr" ? loc.name_mr : loc.name_en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Season & Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-soil-800 mb-1">
                    {lang === "mr" ? "हंगाम" : "Season"}
                  </label>
                  <div className="flex rounded-xl border border-soil-200 overflow-hidden">
                    {(["KHARIF", "RABI"] as Season[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeason(s)}
                        className={`flex-1 py-2 text-xs font-semibold ${
                          season === s
                            ? "bg-leaf-700 text-white"
                            : "bg-white text-soil-800"
                        }`}
                      >
                        {s === "KHARIF"
                          ? lang === "mr"
                            ? "खरीप"
                            : "Kharif"
                          : lang === "mr"
                            ? "रब्बी"
                            : "Rabi"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-soil-800 mb-1">
                    {lang === "mr" ? "सल्ला प्रकार" : "Advisory Mode"}
                  </label>
                  <div className="flex rounded-xl border border-soil-200 overflow-hidden">
                    {(["PRE_SOWING", "POST_SOWING"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`flex-1 py-2 text-xs font-semibold ${
                          mode === m
                            ? "bg-water-600 text-white"
                            : "bg-white text-soil-800"
                        }`}
                      >
                        {m === "PRE_SOWING"
                          ? lang === "mr"
                            ? "पेरणीपूर्वी"
                            : "Pre-Sowing"
                          : lang === "mr"
                            ? "पेरणी नंतर"
                            : "Post-Sowing"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sowing Date */}
              <div>
                <label className="block text-xs font-semibold text-soil-800 mb-1">
                  {lang === "mr" ? "पेरणीची तारीख" : "Sowing Date"}
                </label>
                <input
                  type="date"
                  value={sowingDate}
                  onChange={(e) => setSowingDate(e.target.value)}
                  className="w-full rounded-xl border border-soil-200 bg-soil-50 px-3 py-2.5 text-sm"
                />
              </div>

              {/* Standing crop (Post-Sowing only) */}
              {mode === "POST_SOWING" && (
                <div>
                  <label className="block text-xs font-semibold text-soil-800 mb-1">
                    {lang === "mr" ? "उभे पीक निवडा" : "Standing Crop"}
                  </label>
                  <select
                    value={standingCropId}
                    onChange={(e) => setStandingCropId(e.target.value)}
                    className="w-full rounded-xl border border-soil-200 bg-soil-50 px-3 py-2.5 text-sm"
                  >
                    {seasonCrops.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === "mr" ? c.name_mr : c.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Irrigation Access */}
              <div>
                <label className="block text-xs font-semibold text-soil-800 mb-1">
                  {lang === "mr" ? "सिंचन उपलब्धता" : "Irrigation Access"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["RAINFED", lang === "mr" ? "कोरडवाहू (0 mm)" : "Rainfed (0 mm)"],
                      ["LIMITED", lang === "mr" ? "मर्यादित (150 mm)" : "Limited (150 mm)"],
                      ["ASSURED", lang === "mr" ? "खात्रीशीर (400 mm)" : "Assured (400 mm)"],
                    ] as [IrrigationAccess, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setIrrigationAccess(val)}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold ${
                        irrigationAccess === val
                          ? "bg-water-600 text-white border-water-600"
                          : "bg-soil-50 text-soil-800 border-soil-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setIsDemoScenario(false);
                  runAnalyze({ is_demo_scenario: false });
                }}
                className="w-full py-3.5 rounded-xl bg-leaf-700 hover:bg-leaf-600 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {loading
                  ? lang === "mr"
                    ? "गणना सुरू आहे..."
                    : "Calculating..."
                  : lang === "mr"
                    ? "पाणी-संतुलन विश्लेषण पहा"
                    : "Run Water-Balance Analysis"}
              </button>
            </section>
          </div>
        )}

        {/* TAB 2: RESULTS (PRE-SOWING OR POST-SOWING) */}
        {tab === "results" && (
          <div className="space-y-4">
            {!analysis ? (
              <div className="rounded-2xl bg-white p-6 text-center text-sm text-soil-600 border border-soil-200">
                {lang === "mr"
                  ? "कृपया आधी 'सेटअप' मधून विश्लेषण चालवा."
                  : "Please run an analysis from Setup first."}
              </div>
            ) : (
              <>
                {/* Provenance & Confidence Strip */}
                <section className="rounded-2xl bg-white border border-soil-200 p-3.5 shadow-sm space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-soil-900">
                      {lang === "mr"
                        ? analysis.location.name_mr
                        : analysis.location.name_en}{" "}
                      · {analysis.input.season} · {analysis.input.sowing_date}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        analysis.confidence.level === "HIGH"
                          ? "bg-leaf-100 text-leaf-700"
                          : analysis.confidence.level === "MEDIUM"
                            ? "bg-amberwarn-100 text-amberwarn-700"
                            : "bg-risk-100 text-risk-700"
                      }`}
                    >
                      {lang === "mr" ? "विश्वासार्हता: " : "Confidence: "}
                      {analysis.confidence.level}
                    </span>
                  </div>

                  {analysis.is_demo_scenario && (
                    <div className="text-xs font-semibold text-amberwarn-700 bg-amberwarn-50 px-2.5 py-1 rounded-lg border border-amberwarn-600/40">
                      {lang === "mr"
                        ? "प्रात्यक्षिक सराव (Demonstration Scenario) — सध्याची पेरणी शिफारस नाही"
                        : "Demonstration Scenario — not a current sowing recommendation"}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-soil-700">
                    <div className="bg-soil-50 p-2 rounded-lg">
                      <span className="font-semibold block">
                        {lang === "mr" ? "भूजल (GSDA 2023):" : "Groundwater (GSDA 2023):"}
                      </span>
                      {analysis.groundwater.category} (
                      {analysis.groundwater.stage_of_extraction_pct ?? "N/A"}%)
                    </div>
                    <div className="bg-soil-50 p-2 rounded-lg">
                      <span className="font-semibold block">
                        {lang === "mr" ? "हवामान स्रोत:" : "Weather Source:"}
                      </span>
                      {lang === "mr"
                        ? analysis.weather_status.source_label_mr
                        : analysis.weather_status.source_label_en}
                    </div>
                  </div>
                </section>

                {/* Marathi AI Explanation */}
                <section className="rounded-2xl bg-leaf-50 border border-leaf-500/40 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-leaf-700">
                      {lang === "mr"
                        ? "मराठी सारांश (AI स्पष्टीकरण)"
                        : "Marathi Summary (AI Explainer)"}
                    </h3>
                    {explanation?.used_fallback && (
                      <span className="text-[10px] bg-white px-2 py-0.5 rounded text-soil-600 border border-soil-200">
                        Template
                      </span>
                    )}
                  </div>
                  {explainLoading ? (
                    <p className="text-xs text-soil-600">सारांश तयार होत आहे...</p>
                  ) : explanation ? (
                    <p className="text-xs text-soil-900 leading-relaxed">
                      {explanation.summary_mr}
                    </p>
                  ) : null}
                </section>

                {/* PRE-SOWING RANKED CROPS */}
                {analysis.pre_sowing && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-soil-900">
                        {lang === "mr"
                          ? "पीक क्रमवारी (तपशीलासाठी टॅप करा)"
                          : "Ranked Crops (Tap for Detail)"}
                      </h3>
                      <span className="text-[10px] text-soil-600">
                        Unvalidated prototype assumption
                      </span>
                    </div>

                    {analysis.pre_sowing.ranked_crops.map((crop, idx) => {
                      const band = bandBadge(crop.band);
                      const risk = riskBadge(crop.water_risk);
                      return (
                        <button
                          key={crop.crop_id}
                          type="button"
                          onClick={() => {
                            setSelectedCropId(crop.crop_id);
                            setTab("detail");
                          }}
                          className="w-full text-left rounded-2xl bg-white border border-soil-200 p-3.5 shadow-sm hover:border-leaf-500 transition space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold text-soil-600">
                                #{idx + 1}
                              </span>{" "}
                              <span className="text-base font-bold text-soil-900">
                                {lang === "mr" ? crop.name_mr : crop.name_en}
                              </span>
                              <div className="text-[11px] text-soil-600">
                                {crop.duration_days}{" "}
                                {lang === "mr" ? "दिवस" : "days"} ·{" "}
                                {lang === "mr" ? "स्थिरता:" : "Robustness:"}{" "}
                                {crop.robustness.level}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold text-leaf-700">
                                {crop.scores.total}
                                <span className="text-xs font-normal text-soil-600">
                                  /100
                                </span>
                              </div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${band.cls}`}
                              >
                                {lang === "mr" ? band.mr : band.en}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-soil-100 text-[11px]">
                            <div>
                              <span className="text-soil-600 block">
                                {lang === "mr" ? "गरज (ETc)" : "Demand"}
                              </span>
                              <span className="font-semibold">
                                {crop.water_demand_etc_mm} mm
                              </span>
                            </div>
                            <div>
                              <span className="text-soil-600 block">
                                {lang === "mr" ? "पाण्याची तूट" : "Water Gap"}
                              </span>
                              <span className="font-semibold">
                                {crop.water_gap_mm} mm
                              </span>
                            </div>
                            <div>
                              <span className="text-soil-600 block">
                                {lang === "mr" ? "पाणी जोखीम" : "Water Risk"}
                              </span>
                              <span className={`font-semibold ${risk.cls}`}>
                                {lang === "mr" ? risk.mr : risk.en}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </section>
                )}

                {/* POST-SOWING PROTECTIVE GUIDANCE */}
                {analysis.post_sowing && (
                  <section className="space-y-3">
                    <div className="rounded-2xl bg-white border border-water-500 p-4 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-soil-900">
                          {lang === "mr"
                            ? analysis.post_sowing.name_mr
                            : analysis.post_sowing.name_en}
                        </h3>
                        <span className="text-xs font-bold bg-water-100 text-water-600 px-2.5 py-1 rounded-full">
                          {analysis.post_sowing.days_since_sowing}{" "}
                          {lang === "mr" ? "दिवस" : "days"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-soil-800">
                        {lang === "mr" ? "सध्याची अवस्था: " : "Current Stage: "}
                        {lang === "mr"
                          ? analysis.post_sowing.current_stage_label_mr
                          : analysis.post_sowing.current_stage_label_en}
                      </p>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-soil-100 text-xs">
                        <div>
                          <span className="text-soil-600 block text-[11px]">
                            {lang === "mr" ? "१४ दिवस गरज" : "14d Demand"}
                          </span>
                          <span className="font-bold">
                            {analysis.post_sowing.next_14d_etc_mm} mm
                          </span>
                        </div>
                        <div>
                          <span className="text-soil-600 block text-[11px]">
                            {lang === "mr" ? "अपेक्षित पाऊस" : "14d Rain"}
                          </span>
                          <span className="font-bold">
                            {analysis.post_sowing.next_14d_forecast_rain_mm} mm
                          </span>
                        </div>
                        <div>
                          <span className="text-soil-600 block text-[11px]">
                            {lang === "mr" ? "तूट" : "Deficit"}
                          </span>
                          <span className="font-bold text-risk-700">
                            {analysis.post_sowing.next_14d_deficit_mm} mm
                          </span>
                        </div>
                      </div>
                    </div>

                    {analysis.post_sowing.guidance_cards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-2xl bg-white border border-soil-200 p-3.5 shadow-sm space-y-1"
                      >
                        <div className="text-sm font-bold text-leaf-700">
                          {lang === "mr" ? card.title_mr : card.title_en}
                        </div>
                        <p className="text-xs text-soil-800 leading-relaxed">
                          {lang === "mr" ? card.body_mr : card.body_en}
                        </p>
                        <div className="text-[10px] text-soil-600">
                          {card.source_note}
                        </div>
                      </div>
                    ))}

                    <div className="rounded-2xl bg-soil-100 border border-soil-200 p-3.5 space-y-1">
                      <h4 className="text-xs font-bold text-soil-800">
                        {lang === "mr"
                          ? "आम्ही काय ठरवू शकत नाही (Limitations):"
                          : "What we cannot decide:"}
                      </h4>
                      <ul className="list-disc pl-4 text-xs text-soil-700 space-y-0.5">
                        {(lang === "mr"
                          ? analysis.post_sowing.cannot_decide_mr
                          : analysis.post_sowing.cannot_decide_en
                        ).map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: CROP DETAIL + WHAT-IF SLIDERS */}
        {tab === "detail" && selectedCrop && analysis && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setTab("results")}
              className="text-xs font-bold text-leaf-700 underline"
            >
              ← {lang === "mr" ? "सर्व पिकांकडे परत जा" : "Back to Ranked Crops"}
            </button>

            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-soil-900">
                  {lang === "mr" ? selectedCrop.name_mr : selectedCrop.name_en}
                </h2>
                <span className="text-xl font-bold text-leaf-700">
                  {selectedCrop.scores.total}/100
                </span>
              </div>
              <p className="text-xs text-soil-700">
                {lang === "mr" ? "पाण्याची तूट: " : "Water Gap: "}
                <strong>{selectedCrop.water_gap_mm} mm</strong> (
                {selectedCrop.water_gap_litres_per_acre.toLocaleString()} L/acre) ·{" "}
                {lang === "mr" ? "अंदाज कव्हरेज: " : "Forecast coverage: "}
                {selectedCrop.forecast_coverage_days}d /{" "}
                {selectedCrop.duration_days}d
              </p>

              {/* What-If Rainfall Slider */}
              <div className="rounded-xl bg-soil-50 border border-soil-200 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>
                    {lang === "mr"
                      ? "जर-तर (What-If) पाऊस बदल:"
                      : "What-If Rainfall Multiplier:"}
                  </span>
                  <span className="text-leaf-700">
                    {Math.round(rainfallMult * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.4}
                  step={0.1}
                  value={rainfallMult}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRainfallMult(val);
                    runAnalyze({
                      rainfall_multiplier: val,
                      saveToHistory: false,
                      goToResults: false,
                    });
                  }}
                  className="w-full"
                />
                <div className="flex gap-1.5 pt-1">
                  {(
                    [
                      ["NORMAL", lang === "mr" ? "सामान्य" : "Normal"],
                      ["DRY_P20", lang === "mr" ? "कोरडे वर्ष (P20)" : "Dry Year (P20)"],
                      ["WET_P80", lang === "mr" ? "ओले वर्ष (P80)" : "Wet Year (P80)"],
                    ] as [ClimateScenario, string][]
                  ).map(([sc, label]) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => {
                        setClimateScenario(sc);
                        runAnalyze({
                          climate_scenario: sc,
                          saveToHistory: false,
                          goToResults: false,
                        });
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border ${
                        climateScenario === sc
                          ? "bg-leaf-700 text-white border-leaf-700"
                          : "bg-white text-soil-800 border-soil-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Charts */}
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-2">
              <h3 className="text-xs font-bold text-soil-800">
                {lang === "mr"
                  ? "पाण्याची मागणी विरुद्ध पुरवठा (mm)"
                  : "Water Demand vs Supply (mm)"}
              </h3>
              <WaterBalanceBarChart crop={selectedCrop} lang={lang} />
            </section>

            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-2">
              <h3 className="text-xs font-bold text-soil-800">
                {lang === "mr" ? "गुण विभागणी (Waterfall)" : "Score Breakdown"}
              </h3>
              <ScoreWaterfallChart crop={selectedCrop} lang={lang} />
            </section>

            {/* Stage Timeline */}
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-2">
              <h3 className="text-xs font-bold text-soil-800">
                {lang === "mr" ? "पीक अवस्था वेळापत्रक" : "Crop Stage Timeline"}
              </h3>
              <div className="space-y-1.5">
                {selectedCrop.stages.map((st) => (
                  <div
                    key={st.stage}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                      st.is_critical
                        ? "bg-amberwarn-50 border-amberwarn-600/50"
                        : "bg-soil-50 border-soil-200"
                    }`}
                  >
                    <div>
                      <span className="font-bold">
                        {lang === "mr" ? st.label_mr : st.label_en}
                      </span>
                      <div className="text-[11px] text-soil-600">
                        {st.start_date} → {st.end_date} ({st.days}d)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">ETc: {st.etc_mm} mm</div>
                      <div className="text-[11px] text-water-600">
                        Pe: {st.effective_rain_mm} mm
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: MARATHI ASSISTANT */}
        {tab === "assistant" && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-soil-900">
                {lang === "mr"
                  ? "मराठी पाणी-संतुलन सहाय्यक"
                  : "Marathi Water-Balance Assistant"}
              </h2>
              {!analysis ? (
                <p className="text-xs text-soil-600">
                  {lang === "mr"
                    ? "प्रश्न विचारण्यापूर्वी कृपया 'सेटअप' मधून विश्लेषण चालवा."
                    : "Please run an analysis first before asking questions."}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "पहिल्या क्रमांकाचे पीक का निवडले?",
                      "माझ्या पिकाची पाण्याची तूट किती आहे?",
                      "या पिकावर कीड पडली तर कोणते औषध फवारावे?",
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendChat(q)}
                        className="text-left text-[11px] bg-soil-50 hover:bg-soil-100 border border-soil-200 rounded-lg px-2.5 py-1.5"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={
                        lang === "mr"
                          ? "मराठीत प्रश्न विचारा..."
                          : "Ask a question in Marathi..."
                      }
                      className="flex-1 rounded-xl border border-soil-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={chatLoading || !chatInput.trim()}
                      onClick={() => sendChat(chatInput)}
                      className="px-4 py-2 rounded-xl bg-leaf-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {chatLoading ? "..." : lang === "mr" ? "विचारा" : "Ask"}
                    </button>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    {chatHistory.map((item, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-3 text-xs space-y-1 border ${
                          item.refused
                            ? "bg-amberwarn-50 border-amberwarn-600/50"
                            : "bg-leaf-50 border-leaf-500/40"
                        }`}
                      >
                        <div className="font-bold text-soil-900">प्र: {item.q}</div>
                        <div className="text-soil-800 leading-relaxed">{item.a}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* TAB 5: DATA TRANSPARENCY */}
        {tab === "transparency" && (
          <div className="space-y-3">
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-2 text-xs">
              <h2 className="text-base font-bold text-soil-900">
                {lang === "mr" ? "डेटा स्रोत आणि पारदर्शकता" : "Data Sources & Provenance"}
              </h2>
              <p>
                <strong>Groundwater:</strong> Dynamic Groundwater Resources of Maharashtra
                2023 (Published March 2024, GSDA/CGWB, GWRE-State-Report-2022-23). Latur:
                Semi-Critical (70.7%), Baramati: Semi-Critical (80.4%), Nagpur: Safe
                (46.5%). Static baseline, never labelled live.
              </p>
              <p>
                <strong>Weather:</strong> Open-Meteo 16-day Forecast (Asia/Kolkata).
                Fallback chain: Live → Cached last-live (localStorage) → Offline
                Demonstration Sample.
              </p>
              <p>
                <strong>Climatology P20/P80:</strong> Coherent historical-year annual
                precipitation sequences (2015–2025 ERA5-Land) when built, or clearly
                labelled prototype regional fallback.
              </p>
              <p>
                <strong>Crop Parameters:</strong> FAO-56 Table 12 Kc cross-checked;
                durations, sowing windows, and scoring weights are{" "}
                <span className="font-semibold text-amberwarn-700">
                  Unvalidated prototype assumptions
                </span>
                .
              </p>
              {analysis && (
                <p className="text-[11px] text-soil-600 pt-1 border-t border-soil-100">
                  Engine v{analysis.engine_version} · Catalogue v{analysis.catalogue_version}{" "}
                  · Config v{analysis.config_version}
                </p>
              )}
            </section>
          </div>
        )}

        {/* TAB 6: HISTORY (LOCAL IMMUTABLE SNAPSHOTS + COMPARE <= 3) */}
        {tab === "history" && (
          <div className="space-y-3">
            <section className="rounded-2xl bg-white border border-soil-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-soil-900">
                  {lang === "mr" ? "स्थानिक इतिहास (History)" : "Local History"}
                </h2>
                <span className="text-[11px] text-soil-600">
                  {compareIds.length}/3 {lang === "mr" ? "निवडलेले" : "selected"}
                </span>
              </div>

              {history.length === 0 ? (
                <p className="text-xs text-soil-600">
                  {lang === "mr" ? "अजून कोणतीही नोंद नाही." : "No saved runs yet."}
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((snap) => {
                    const checked = compareIds.includes(snap.id);
                    const top = snap.analysis.pre_sowing?.ranked_crops[0];
                    return (
                      <div
                        key={snap.id}
                        className="rounded-xl border border-soil-200 p-3 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}{" "}
                            · {snap.analysis.input.season} · {snap.analysis.input.mode}
                          </div>
                          <div className="text-[11px] text-soil-600">
                            {snap.saved_at.slice(0, 16).replace("T", " ")} ·{" "}
                            {top
                              ? `${lang === "mr" ? top.name_mr : top.name_en} (${top.scores.total}/100)`
                              : snap.analysis.post_sowing?.name_mr}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCompareIds((prev) =>
                              prev.includes(snap.id)
                                ? prev.filter((x) => x !== snap.id)
                                : prev.length < 3
                                  ? [...prev, snap.id]
                                  : prev
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                            checked
                              ? "bg-leaf-700 text-white border-leaf-700"
                              : "bg-soil-50 text-soil-800 border-soil-200"
                          }`}
                        >
                          {checked
                            ? lang === "mr"
                              ? "निवडले"
                              : "Selected"
                            : lang === "mr"
                              ? "तुलना"
                              : "Compare"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {compareIds.length >= 2 && (
                <div className="pt-2 border-t border-soil-200 space-y-2">
                  <h3 className="text-xs font-bold text-soil-800">
                    {lang === "mr" ? "तुलना (Side-by-Side)" : "Comparison"}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {compareIds.map((id) => {
                      const snap = history.find((h) => h.id === id);
                      if (!snap) return null;
                      const top = snap.analysis.pre_sowing?.ranked_crops[0];
                      return (
                        <div
                          key={id}
                          className="rounded-xl bg-soil-50 border border-soil-200 p-2.5 text-[11px] space-y-1"
                        >
                          <div className="font-bold">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}
                          </div>
                          <div>{snap.analysis.input.sowing_date}</div>
                          <div>GW: {snap.analysis.groundwater.category}</div>
                          {top && (
                            <div className="font-semibold text-leaf-700">
                              #1 {lang === "mr" ? top.name_mr : top.name_en} ({top.scores.total})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
