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
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

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
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("jal_krishi_theme", next ? "dark" : "light");
    } catch {}
  }

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

  const topCrop = analysis?.pre_sowing?.ranked_crops[0];

  const bandBadge = (band: CropAnalysisResult["band"]) => {
    if (band === "BETTER_SUITED")
      return {
        cls: "bg-palesage text-forestteal border-sage dark:bg-forestteal/30 dark:text-sage dark:border-forestteal",
        mr: "अधिक योग्य (≥70)",
        en: "Better suited (≥70)",
      };
    if (band === "POSSIBLE_WITH_CAUTION")
      return {
        cls: "bg-amberwarn-100 text-amberwarn-700 border-amberwarn-600/40 dark:bg-amberwarn-700/20 dark:text-amberwarn-100",
        mr: "सावधगिरीने शक्य (40–69)",
        en: "Possible with caution (40–69)",
      };
    return {
      cls: "bg-risk-100 text-risk-700 border-risk-600/40 dark:bg-risk-700/20 dark:text-risk-100",
      mr: "जास्त पाणी जोखीम (<40)",
      en: "High water risk (<40)",
    };
  };

  const riskBadge = (risk: CropAnalysisResult["water_risk"]) => {
    if (risk === "LOW") return { mr: "कमी (<15%)", en: "LOW (<15%)", cls: "text-forestteal dark:text-sage" };
    if (risk === "MODERATE") return { mr: "मध्यम (15–35%)", en: "MODERATE (15–35%)", cls: "text-amberwarn-700 dark:text-amberwarn-100" };
    if (risk === "HIGH") return { mr: "जास्त (35–60%)", en: "HIGH (35–60%)", cls: "text-risk-700 dark:text-risk-100" };
    return { mr: "तीव्र (≥60%)", en: "SEVERE (≥60%)", cls: "text-risk-700 dark:text-risk-100 font-bold" };
  };

  const navItems: { id: Tab; mr: string; en: string; icon: string }[] = [
    { id: "setup", mr: "सेटअप", en: "Setup", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" },
    { id: "results", mr: "विश्लेषण", en: "Dashboard", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { id: "assistant", mr: "सहाय्यक", en: "Assistant", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    { id: "transparency", mr: "डेटा स्रोत", en: "Sources", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { id: "history", mr: "इतिहास", en: "History", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  return (
    <div className="min-h-screen flex bg-gradient-to-b from-[#F5F6F2] via-[#F5F6F2] to-[#DFE9E3]/60 dark:from-[#111917] dark:via-[#111917] dark:to-[#1A2623] text-[var(--text-primary)]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-card)]/80 backdrop-blur-sm transition-all duration-200 ${
          sidebarExpanded ? "w-56" : "w-16"
        }`}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b border-[var(--border-subtle)]">
          {sidebarExpanded && (
            <span className="font-bold text-sm text-forestteal dark:text-sage truncate">
              {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarExpanded((v) => !v)}
            className="p-2 rounded-lg hover:bg-palesage/60 dark:hover:bg-forestteal/30 text-forestteal dark:text-sage"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const active = tab === item.id || (tab === "detail" && item.id === "results");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                  active
                    ? "bg-forestteal text-white shadow-sm dark:bg-sage dark:text-[#111917]"
                    : "text-[var(--text-secondary)] hover:bg-palesage/60 dark:hover:bg-forestteal/20"
                }`}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {sidebarExpanded && (
                  <span className="truncate">{lang === "mr" ? item.mr : item.en}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-[var(--bg-card)] h-full shadow-xl p-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <span className="font-bold text-base text-forestteal dark:text-sage">
                  {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)]"
                >
                  ✕
                </button>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const active = tab === item.id || (tab === "detail" && item.id === "results");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${
                        active
                          ? "bg-forestteal text-white dark:bg-sage dark:text-[#111917]"
                          : "text-[var(--text-secondary)] hover:bg-palesage/60"
                      }`}
                    >
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                      <span>{lang === "mr" ? item.mr : item.en}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] pt-3 border-t border-[var(--border-subtle)]">
              Climate-Intelligence Platform
            </div>
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Header */}
        <header className="sticky top-0 z-30 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/85 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-palesage/60 text-forestteal dark:text-sage"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate">
              <span className="font-bold text-sm sm:text-base text-forestteal dark:text-sage">
                {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
              </span>
              <span className="hidden sm:inline text-xs text-[var(--text-secondary)] ml-2">
                {lang === "mr" ? "हवामान व जल-संतुलन सल्लागार" : "Climate & Water-Balance Intelligence"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSimulateOffline((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                simulateOffline
                  ? "bg-amberwarn-600 border-amberwarn-600 text-white"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-palesage/50"
              }`}
            >
              {simulateOffline
                ? lang === "mr"
                  ? "ऑफलाइन: चालू"
                  : "Offline: ON"
                : lang === "mr"
                  ? "ऑफलाइन सिम"
                  : "Offline Sim"}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-palesage/50"
              aria-label="Toggle theme"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLang((l) => (l === "mr" ? "en" : "mr"))}
              className="px-2.5 py-1.5 rounded-lg bg-forestteal text-white dark:bg-sage dark:text-[#111917] text-xs font-semibold shadow-sm"
            >
              {lang === "mr" ? "EN" : "मराठी"}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-5 space-y-5">
          {/* Global Offline / Demo Banner */}
          {analysis && analysis.weather_status.source_kind !== "LIVE" && (
            <div className="rounded-2xl border border-amberwarn-600/40 bg-amberwarn-50 dark:bg-amberwarn-700/20 px-4 py-3 text-xs text-amberwarn-700 dark:text-amberwarn-100">
              <p className="font-semibold">
                {analysis.weather_status.source_kind === "OFFLINE_DEMO"
                  ? lang === "mr"
                    ? "ऑफलाइन प्रात्यक्षिक मोड (Offline Demonstration Mode)"
                    : "Offline Demonstration Mode"
                  : lang === "mr"
                    ? "साठवलेला हवामान डेटा (Cached Weather)"
                    : "Cached Weather Data"}
              </p>
              <p className="mt-0.5 opacity-90">
                {lang === "mr"
                  ? analysis.weather_status.source_label_mr
                  : analysis.weather_status.source_label_en}
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-2xl border border-risk-600/40 bg-risk-50 dark:bg-risk-700/20 p-3.5 text-sm text-risk-700 dark:text-risk-100">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: COMPACT WELCOME & SETUP */}
          {tab === "setup" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Compact Welcome Section with subtle botanical SVG */}
              <section className="lg:col-span-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-md relative overflow-hidden">
                <svg
                  className="pointer-events-none absolute -right-6 -bottom-6 w-40 h-40 text-sage/20 dark:text-sage/10"
                  viewBox="0 0 120 120"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M60 10C35 30 20 55 20 80c0 16 14 28 40 28s40-12 40-28C100 55 85 30 60 10zm0 18c15 16 24 34 24 52 0 9-9 16-24 16s-24-7-24-16c0-18 9-36 24-52z" />
                </svg>
                <div className="relative space-y-2">
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-mutedblue">
                    {lang === "mr" ? "महाराष्ट्र जल-बुद्धिमत्ता" : "Maharashtra Climate Intelligence"}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-bold text-forestteal dark:text-sage tracking-tight">
                    {lang === "mr"
                      ? "पाणी-संतुलनावर आधारित अचूक पीक सल्ला"
                      : "Water-Balance Crop & Irrigation Intelligence"}
                  </h1>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    {lang === "mr"
                      ? "तुमच्या तालुक्याचे भूजल, पाऊस आणि पिकाची पाण्याची गरज (FAO-56) तपासून पेरणीपूर्वी योग्य पीक निवडा किंवा उभ्या पिकाचे संरक्षण करा."
                      : "Evaluate local groundwater reliability, rainfall, and FAO-56 crop water demand to rank pre-sowing crops or protect standing crops."}
                  </p>
                </div>

                {/* Quick Demo Presets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
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
                    className="text-left p-3.5 rounded-xl border border-sage/60 bg-palesage/40 dark:bg-forestteal/20 hover:bg-palesage/70 transition"
                  >
                    <div className="text-xs font-bold text-forestteal dark:text-sage">
                      {lang === "mr"
                        ? "खरीप T3 प्रात्यक्षिक (लातूर, २० जून)"
                        : "Kharif T3 Demo (Latur, Jun 20)"}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {lang === "mr"
                        ? "निम-संवेदनशील भूजल · प्रात्यक्षिक सराव"
                        : "Semi-Critical GW · Demonstration scenario"}
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
                    className="text-left p-3.5 rounded-xl border border-mutedblue/40 bg-water-50 dark:bg-water-600/15 hover:bg-water-100/70 transition"
                  >
                    <div className="text-xs font-bold text-water-600 dark:text-mutedblue">
                      {lang === "mr"
                        ? "सध्याचा रब्बी हंगाम (बारामती, आज)"
                        : "Current Rabi (Baramati, Today)"}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {lang === "mr"
                        ? "१६-दिवसीय अंदाज + हंगामी सरासरी"
                        : "16-day forecast + seasonal climatology"}
                    </div>
                  </button>
                </div>
              </section>

              {/* Main Input Form */}
              <section className="lg:col-span-7 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-md space-y-4">
                <h2 className="text-base font-bold text-forestteal dark:text-sage">
                  {lang === "mr" ? "शेती आणि हंगाम माहिती" : "Farm & Season Parameters"}
                </h2>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
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
                            ? "bg-forestteal text-white border-forestteal dark:bg-sage dark:text-[#111917] dark:border-sage shadow-sm"
                            : "bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-palesage/40"
                        }`}
                      >
                        {lang === "mr" ? loc.name_mr : loc.name_en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      {lang === "mr" ? "हंगाम" : "Season"}
                    </label>
                    <div className="flex rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                      {(["KHARIF", "RABI"] as Season[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSeason(s)}
                          className={`flex-1 py-2.5 text-xs font-semibold transition ${
                            season === s
                              ? "bg-forestteal text-white dark:bg-sage dark:text-[#111917]"
                              : "bg-[var(--bg-primary)] text-[var(--text-primary)]"
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
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      {lang === "mr" ? "सल्ला प्रकार" : "Advisory Mode"}
                    </label>
                    <div className="flex rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                      {(["PRE_SOWING", "POST_SOWING"] as Mode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`flex-1 py-2.5 text-xs font-semibold transition ${
                            mode === m
                              ? "bg-mutedblue text-white"
                              : "bg-[var(--bg-primary)] text-[var(--text-primary)]"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      {lang === "mr" ? "पेरणीची तारीख" : "Sowing Date"}
                    </label>
                    <input
                      type="date"
                      value={sowingDate}
                      onChange={(e) => setSowingDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm"
                    />
                  </div>

                  {mode === "POST_SOWING" && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                        {lang === "mr" ? "उभे पीक निवडा" : "Standing Crop"}
                      </label>
                      <select
                        value={standingCropId}
                        onChange={(e) => setStandingCropId(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm"
                      >
                        {seasonCrops.map((c) => (
                          <option key={c.id} value={c.id}>
                            {lang === "mr" ? c.name_mr : c.name_en}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
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
                        className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition ${
                          irrigationAccess === val
                            ? "bg-mutedblue text-white border-mutedblue shadow-sm"
                            : "bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-subtle)]"
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
                  className="w-full py-3.5 rounded-xl bg-forestteal hover:bg-leaf-600 text-white dark:bg-sage dark:text-[#111917] font-bold text-sm shadow-sm transition disabled:opacity-50"
                >
                  {loading
                    ? lang === "mr"
                      ? "गणना सुरू आहे..."
                      : "Calculating..."
                    : lang === "mr"
                      ? "विश्लेषण सुरू करा (Start Analysis)"
                      : "Start Analysis"}
                </button>
              </section>
            </div>
          )}

          {/* TAB 2: ANALYSIS-FIRST DASHBOARD */}
          {tab === "results" && (
            <div className="space-y-5">
              {!analysis ? (
                <div className="rounded-2xl bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  {lang === "mr"
                    ? "कृपया आधी 'सेटअप' मधून विश्लेषण सुरू करा."
                    : "Please start an analysis from Setup first."}
                </div>
              ) : (
                <>
                  {/* 1. Prominent Key Metrics Row */}
                  {analysis.pre_sowing && topCrop && (
                    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm">
                        <span className="text-[11px] font-medium text-[var(--text-secondary)] block">
                          {lang === "mr" ? "सर्वोत्तम पीक गुण" : "Top Suitability"}
                        </span>
                        <div className="text-2xl font-bold text-forestteal dark:text-sage mt-1">
                          {topCrop.scores.total}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">/100</span>
                        </div>
                        <span className="text-xs font-semibold mt-1 block truncate">
                          {lang === "mr" ? topCrop.name_mr : topCrop.name_en}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm">
                        <span className="text-[11px] font-medium text-[var(--text-secondary)] block">
                          {lang === "mr" ? "उपलब्ध पाणी" : "Available Water"}
                        </span>
                        <div className="text-2xl font-bold text-mutedblue mt-1">
                          {(topCrop.effective_rain_mm + topCrop.reliable_irrigation_mm).toFixed(0)}
                          <span className="text-xs font-normal text-[var(--text-secondary)]"> mm</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                          {lang === "mr" ? "पाऊस + सिंचन" : "Eff. Rain + Rel. Irrig."}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm">
                        <span className="text-[11px] font-medium text-[var(--text-secondary)] block">
                          {lang === "mr" ? "पाण्याची तूट" : "Water Deficit"}
                        </span>
                        <div className="text-2xl font-bold text-risk-600 dark:text-risk-100 mt-1">
                          {topCrop.water_gap_mm}
                          <span className="text-xs font-normal text-[var(--text-secondary)]"> mm</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                          {topCrop.water_gap_litres_per_acre.toLocaleString()} L/acre
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm">
                        <span className="text-[11px] font-medium text-[var(--text-secondary)] block">
                          {lang === "mr" ? "भूजल स्थिती" : "Groundwater"}
                        </span>
                        <div className="text-lg font-bold text-forestteal dark:text-sage mt-1 truncate">
                          {analysis.groundwater.category}
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                          {analysis.groundwater.stage_of_extraction_pct ?? "N/A"}% extraction
                        </span>
                      </div>
                    </section>
                  )}

                  {/* Supporting Context Strip */}
                  <section className="rounded-2xl bg-palesage/40 dark:bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold">
                      {lang === "mr" ? analysis.location.name_mr : analysis.location.name_en} ·{" "}
                      {analysis.input.season} · {analysis.input.sowing_date}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)]">
                        {lang === "mr"
                          ? analysis.weather_status.source_label_mr
                          : analysis.weather_status.source_label_en}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] font-semibold">
                        {lang === "mr" ? "विश्वासार्हता: " : "Confidence: "}
                        {analysis.confidence.level}
                      </span>
                    </div>
                  </section>

                  {analysis.is_demo_scenario && (
                    <div className="text-xs font-semibold text-amberwarn-700 dark:text-amberwarn-100 bg-amberwarn-50 dark:bg-amberwarn-700/20 px-3.5 py-2 rounded-xl border border-amberwarn-600/40">
                      {lang === "mr"
                        ? "प्रात्यक्षिक सराव (Demonstration Scenario) — सध्याची पेरणी शिफारस नाही"
                        : "Demonstration Scenario — not a current sowing recommendation"}
                    </div>
                  )}

                  {/* Marathi AI Explanation */}
                  <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-forestteal dark:text-sage">
                        {lang === "mr" ? "मराठी सारांश (AI स्पष्टीकरण)" : "Marathi Summary (AI Explainer)"}
                      </h3>
                      {explanation?.used_fallback && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                          Template
                        </span>
                      )}
                    </div>
                    {explainLoading ? (
                      <p className="text-xs text-[var(--text-secondary)]">सारांश तयार होत आहे...</p>
                    ) : explanation ? (
                      <p className="text-xs sm:text-sm leading-relaxed">{explanation.summary_mr}</p>
                    ) : null}
                  </section>

                  {/* PRE-SOWING: VISUAL CARDS + COMPARISON TABLE */}
                  {analysis.pre_sowing && (
                    <>
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-forestteal dark:text-sage">
                            {lang === "mr"
                              ? "पीक शिफारस कार्ड्स (तपशीलासाठी टॅप करा)"
                              : "Crop Recommendations (Tap for Detail)"}
                          </h3>
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            Unvalidated prototype assumption
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                className="text-left rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm hover:border-forestteal dark:hover:border-sage transition space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-xs font-bold text-mutedblue">#{idx + 1}</span>{" "}
                                    <span className="text-base font-bold">
                                      {lang === "mr" ? crop.name_mr : crop.name_en}
                                    </span>
                                    <div className="text-[11px] text-[var(--text-secondary)]">
                                      {crop.duration_days} {lang === "mr" ? "दिवस" : "days"} ·{" "}
                                      {lang === "mr" ? "स्थिरता:" : "Robustness:"} {crop.robustness.level}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xl font-bold text-forestteal dark:text-sage">
                                      {crop.scores.total}
                                      <span className="text-xs font-normal text-[var(--text-secondary)]">/100</span>
                                    </div>
                                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${band.cls}`}>
                                      {lang === "mr" ? band.mr : band.en}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
                                  <div>
                                    <span className="text-[var(--text-secondary)] block">
                                      {lang === "mr" ? "गरज (ETc)" : "Demand"}
                                    </span>
                                    <span className="font-semibold">{crop.water_demand_etc_mm} mm</span>
                                  </div>
                                  <div>
                                    <span className="text-[var(--text-secondary)] block">
                                      {lang === "mr" ? "पाण्याची तूट" : "Water Gap"}
                                    </span>
                                    <span className="font-semibold">{crop.water_gap_mm} mm</span>
                                  </div>
                                  <div>
                                    <span className="text-[var(--text-secondary)] block">
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
                        </div>
                      </section>

                      {/* Detailed Comparison Table */}
                      <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-3">
                        <h3 className="text-sm font-bold text-forestteal dark:text-sage">
                          {lang === "mr" ? "तुलनात्मक तक्ता" : "Detailed Comparison Table"}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                                <th className="py-2 pr-3 font-semibold">{lang === "mr" ? "पीक" : "Crop"}</th>
                                <th className="py-2 px-2 font-semibold">{lang === "mr" ? "गुण" : "Score"}</th>
                                <th className="py-2 px-2 font-semibold">{lang === "mr" ? "गरज (mm)" : "ETc (mm)"}</th>
                                <th className="py-2 px-2 font-semibold">{lang === "mr" ? "तूट (mm)" : "Gap (mm)"}</th>
                                <th className="py-2 pl-2 font-semibold">{lang === "mr" ? "जोखीम" : "Risk"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analysis.pre_sowing.ranked_crops.map((crop, idx) => (
                                <tr
                                  key={crop.crop_id}
                                  onClick={() => {
                                    setSelectedCropId(crop.crop_id);
                                    setTab("detail");
                                  }}
                                  className="border-b border-[var(--border-subtle)]/60 last:border-0 hover:bg-palesage/30 dark:hover:bg-forestteal/20 cursor-pointer"
                                >
                                  <td className="py-2.5 pr-3 font-semibold">
                                    #{idx + 1} {lang === "mr" ? crop.name_mr : crop.name_en}
                                  </td>
                                  <td className="py-2.5 px-2 font-bold text-forestteal dark:text-sage">
                                    {crop.scores.total}/100
                                  </td>
                                  <td className="py-2.5 px-2">{crop.water_demand_etc_mm}</td>
                                  <td className="py-2.5 px-2">{crop.water_gap_mm}</td>
                                  <td className="py-2.5 pl-2">{crop.water_risk}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  )}

                  {/* POST-SOWING PROTECTIVE GUIDANCE */}
                  {analysis.post_sowing && (
                    <section className="space-y-3">
                      <div className="rounded-2xl bg-[var(--bg-card)] border border-mutedblue p-4 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold">
                            {lang === "mr" ? analysis.post_sowing.name_mr : analysis.post_sowing.name_en}
                          </h3>
                          <span className="text-xs font-bold bg-water-100 text-water-600 px-2.5 py-1 rounded-full">
                            {analysis.post_sowing.days_since_sowing} {lang === "mr" ? "दिवस" : "days"}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          {lang === "mr" ? "सध्याची अवस्था: " : "Current Stage: "}
                          {lang === "mr"
                            ? analysis.post_sowing.current_stage_label_mr
                            : analysis.post_sowing.current_stage_label_en}
                        </p>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "१४ दिवस गरज" : "14d Demand"}
                            </span>
                            <span className="font-bold">{analysis.post_sowing.next_14d_etc_mm} mm</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "अपेक्षित पाऊस" : "14d Rain"}
                            </span>
                            <span className="font-bold">{analysis.post_sowing.next_14d_forecast_rain_mm} mm</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "तूट" : "Deficit"}
                            </span>
                            <span className="font-bold text-risk-600 dark:text-risk-100">
                              {analysis.post_sowing.next_14d_deficit_mm} mm
                            </span>
                          </div>
                        </div>
                      </div>

                      {analysis.post_sowing.guidance_cards.map((card) => (
                        <div
                          key={card.id}
                          className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-1"
                        >
                          <div className="text-sm font-bold text-forestteal dark:text-sage">
                            {lang === "mr" ? card.title_mr : card.title_en}
                          </div>
                          <p className="text-xs leading-relaxed">{lang === "mr" ? card.body_mr : card.body_en}</p>
                          <div className="text-[10px] text-[var(--text-secondary)]">{card.source_note}</div>
                        </div>
                      ))}

                      <div className="rounded-2xl bg-palesage/40 dark:bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-1">
                        <h4 className="text-xs font-bold">
                          {lang === "mr" ? "आम्ही काय ठरवू शकत नाही (Limitations):" : "What we cannot decide:"}
                        </h4>
                        <ul className="list-disc pl-4 text-xs text-[var(--text-secondary)] space-y-0.5">
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
                className="text-xs font-bold text-forestteal dark:text-sage underline"
              >
                ← {lang === "mr" ? "सर्व पिकांकडे परत जा" : "Back to Dashboard"}
              </button>

              <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">
                    {lang === "mr" ? selectedCrop.name_mr : selectedCrop.name_en}
                  </h2>
                  <span className="text-xl font-bold text-forestteal dark:text-sage">
                    {selectedCrop.scores.total}/100
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {lang === "mr" ? "पाण्याची तूट: " : "Water Gap: "}
                  <strong className="text-[var(--text-primary)]">{selectedCrop.water_gap_mm} mm</strong> (
                  {selectedCrop.water_gap_litres_per_acre.toLocaleString()} L/acre) ·{" "}
                  {lang === "mr" ? "अंदाज कव्हरेज: " : "Forecast coverage: "}
                  {selectedCrop.forecast_coverage_days}d / {selectedCrop.duration_days}d
                </p>

                <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>
                      {lang === "mr" ? "जर-तर (What-If) पाऊस बदल:" : "What-If Rainfall Multiplier:"}
                    </span>
                    <span className="text-forestteal dark:text-sage">{Math.round(rainfallMult * 100)}%</span>
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
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                          climateScenario === sc
                            ? "bg-forestteal text-white border-forestteal dark:bg-sage dark:text-[#111917]"
                            : "bg-[var(--bg-card)] border-[var(--border-subtle)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold text-[var(--text-secondary)]">
                    {lang === "mr" ? "पाण्याची मागणी विरुद्ध पुरवठा (mm)" : "Water Demand vs Supply (mm)"}
                  </h3>
                  <WaterBalanceBarChart crop={selectedCrop} lang={lang} />
                </section>

                <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold text-[var(--text-secondary)]">
                    {lang === "mr" ? "गुण विभागणी (Waterfall)" : "Score Breakdown"}
                  </h3>
                  <ScoreWaterfallChart crop={selectedCrop} lang={lang} />
                </section>
              </div>

              <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-sm space-y-2">
                <h3 className="text-xs font-bold text-[var(--text-secondary)]">
                  {lang === "mr" ? "पीक अवस्था वेळापत्रक" : "Crop Stage Timeline"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedCrop.stages.map((st) => (
                    <div
                      key={st.stage}
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                        st.is_critical
                          ? "bg-amberwarn-50 dark:bg-amberwarn-700/20 border-amberwarn-600/40"
                          : "bg-[var(--bg-primary)] border-[var(--border-subtle)]"
                      }`}
                    >
                      <div>
                        <span className="font-bold">{lang === "mr" ? st.label_mr : st.label_en}</span>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {st.start_date} → {st.end_date} ({st.days}d)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">ETc: {st.etc_mm} mm</div>
                        <div className="text-[11px] text-mutedblue">Pe: {st.effective_rain_mm} mm</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: MARATHI ASSISTANT */}
          {tab === "assistant" && (
            <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-forestteal dark:text-sage">
                {lang === "mr" ? "मराठी पाणी-संतुलन सहाय्यक" : "Marathi Water-Balance Assistant"}
              </h2>
              {!analysis ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  {lang === "mr"
                    ? "प्रश्न विचारण्यापूर्वी कृपया 'सेटअप' मधून विश्लेषण सुरू करा."
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
                        className="text-left text-[11px] bg-[var(--bg-primary)] hover:bg-palesage/50 border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5"
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
                      placeholder={lang === "mr" ? "मराठीत प्रश्न विचारा..." : "Ask a question in Marathi..."}
                      className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={chatLoading || !chatInput.trim()}
                      onClick={() => sendChat(chatInput)}
                      className="px-4 py-2 rounded-xl bg-forestteal text-white dark:bg-sage dark:text-[#111917] text-xs font-bold disabled:opacity-50"
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
                            ? "bg-amberwarn-50 dark:bg-amberwarn-700/20 border-amberwarn-600/40"
                            : "bg-palesage/40 dark:bg-forestteal/20 border-sage/50"
                        }`}
                      >
                        <div className="font-bold">प्र: {item.q}</div>
                        <div className="leading-relaxed">{item.a}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* TAB 5: DATA TRANSPARENCY */}
          {tab === "transparency" && (
            <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-sm space-y-2.5 text-xs">
              <h2 className="text-base font-bold text-forestteal dark:text-sage">
                {lang === "mr" ? "डेटा स्रोत आणि पारदर्शकता" : "Data Sources & Provenance"}
              </h2>
              <p>
                <strong>Groundwater:</strong> Dynamic Groundwater Resources of Maharashtra 2023
                (Published March 2024, GSDA/CGWB, GWRE-State-Report-2022-23). Latur: Semi-Critical
                (70.7%), Baramati: Semi-Critical (80.4%), Nagpur: Safe (46.5%). Static baseline,
                never labelled live.
              </p>
              <p>
                <strong>Weather:</strong> Open-Meteo 16-day Forecast (Asia/Kolkata). Fallback chain:
                Live → Cached last-live (localStorage) → Offline Demonstration Sample.
              </p>
              <p>
                <strong>Climatology P20/P80:</strong> Coherent historical-year annual precipitation
                sequences (2015–2025 ERA5-Land) when built, or clearly labelled prototype regional
                fallback.
              </p>
              <p>
                <strong>Crop Parameters:</strong> FAO-56 Table 12 Kc cross-checked; durations,
                sowing windows, and scoring weights are{" "}
                <span className="font-semibold text-amberwarn-700 dark:text-amberwarn-100">
                  Unvalidated prototype assumptions
                </span>
                .
              </p>
              {analysis && (
                <p className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                  Engine v{analysis.engine_version} · Catalogue v{analysis.catalogue_version} ·
                  Config v{analysis.config_version}
                </p>
              )}
            </section>
          )}

          {/* TAB 6: HISTORY */}
          {tab === "history" && (
            <section className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-forestteal dark:text-sage">
                  {lang === "mr" ? "स्थानिक इतिहास (History)" : "Local History"}
                </h2>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {compareIds.length}/3 {lang === "mr" ? "निवडलेले" : "selected"}
                </span>
              </div>

              {history.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
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
                        className="rounded-xl border border-[var(--border-subtle)] p-3 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}{" "}
                            · {snap.analysis.input.season} · {snap.analysis.input.mode}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
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
                              ? "bg-forestteal text-white border-forestteal dark:bg-sage dark:text-[#111917]"
                              : "bg-[var(--bg-primary)] border-[var(--border-subtle)]"
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
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                  <h3 className="text-xs font-bold">
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
                          className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-2.5 text-[11px] space-y-1"
                        >
                          <div className="font-bold">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}
                          </div>
                          <div>{snap.analysis.input.sowing_date}</div>
                          <div>GW: {snap.analysis.groundwater.category}</div>
                          {top && (
                            <div className="font-semibold text-forestteal dark:text-sage">
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
          )}
        </main>
      </div>
    </div>
  );
}
