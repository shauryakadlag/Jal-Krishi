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
import {
  CropsComparisonBarChart,
  ScoreWaterfallChart,
  WaterBalanceBarChart,
} from "@/components/Charts";
import { soundManager } from "@/lib/sound";

type Tab = "setup" | "results" | "detail" | "assistant" | "transparency" | "history";

export default function JalKrishiApp() {
  const [lang, setLang] = useState<"mr" | "en">("mr");
  const [tab, setTab] = useState<Tab>("setup");
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Sound Engine State
  const [soundState, setSoundState] = useState({ isMuted: false, volume: 0.5 });
  const [soundPopoverOpen, setSoundPopoverOpen] = useState(false);

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

    // Initialize interface sound listener (binds WWZ-inspired repeated hover and click sounds)
    soundManager.initInterfaceListeners();
    const unsubscribeSound = soundManager.subscribe((st) => setSoundState(st));
    return () => unsubscribeSound();
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
        cls: "bg-turquoise-500/20 text-[#074D5A] dark:text-turquoise-300 border-turquoise-500/40 font-bold",
        mr: "अधिक योग्य (≥70)",
        en: "Better suited (≥70)",
      };
    if (band === "POSSIBLE_WITH_CAUTION")
      return {
        cls: "bg-amberwarn-50 text-amberwarn-700 border-amberwarn-600/40 dark:bg-amberwarn-700/20 dark:text-amberwarn-100",
        mr: "सावधगिरीने शक्य (40–69)",
        en: "Possible with caution (40–69)",
      };
    return {
      cls: "bg-risk-50 text-risk-700 border-risk-600/40 dark:bg-risk-700/20 dark:text-risk-100",
      mr: "पाणी जोखीम (<40)",
      en: "High water risk (<40)",
    };
  };

  const riskBadge = (risk: CropAnalysisResult["water_risk"]) => {
    if (risk === "LOW") return { mr: "कमी (<15%)", en: "LOW (<15%)", cls: "text-[#086B7B] dark:text-turquoise-400 font-semibold" };
    if (risk === "MODERATE") return { mr: "मध्यम (15–35%)", en: "MODERATE (15–35%)", cls: "text-amberwarn-700 dark:text-amberwarn-100 font-semibold" };
    if (risk === "HIGH") return { mr: "जास्त (35–60%)", en: "HIGH (35–60%)", cls: "text-risk-700 dark:text-risk-100 font-semibold" };
    return { mr: "तीव्र (≥60%)", en: "SEVERE (≥60%)", cls: "text-risk-700 dark:text-risk-100 font-bold" };
  };

  const navItems: { id: Tab; mr: string; en: string; icon: string }[] = [
    {
      id: "setup",
      mr: "सेटअप",
      en: "Setup",
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6",
    },
    {
      id: "results",
      mr: "डॅशबोर्ड",
      en: "Dashboard",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      id: "assistant",
      mr: "सहाय्यक",
      en: "Assistant",
      icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
    },
    {
      id: "transparency",
      mr: "डेटा स्रोत",
      en: "Sources",
      icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    },
    {
      id: "history",
      mr: "इतिहास",
      en: "History",
      icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  return (
    <div className="min-h-screen flex text-[var(--text-primary)] antialiased transition-colors duration-300 relative">
      {/* Desktop Collapsible Glass Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-white/40 dark:border-cyan-500/20 bg-white/40 dark:bg-[#04171E]/60 backdrop-blur-xl transition-all duration-300 z-20 ${
          sidebarExpanded ? "w-60" : "w-16"
        }`}
      >
        <div className={`h-14 flex items-center border-b border-white/40 dark:border-cyan-500/20 px-2 ${
          sidebarExpanded ? "justify-between px-3.5" : "justify-center gap-1"
        }`}>
          {sidebarExpanded ? (
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-turquoise-400 to-[#086B7B] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm border border-white/30">
                💧
              </div>
              <div className="truncate">
                <span className="font-bold text-sm text-[#074D5A] dark:text-turquoise-300 block truncate leading-tight tracking-tight">
                  {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
                </span>
                <span className="text-[10px] text-mutedblue dark:text-cyan-400/80 block truncate leading-none font-medium">
                  Crystal Water AI
                </span>
              </div>
            </div>
          ) : (
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-turquoise-400 to-[#086B7B] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm border border-white/30" title="Jal-Krishi AI">
              💧
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-cyan-500/20 text-[#086B7B] dark:text-turquoise-300 transition shrink-0"
            aria-label="Toggle sidebar"
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-2.5 space-y-1">
          {navItems.map((item) => {
            const active = tab === item.id || (tab === "detail" && item.id === "results");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  active
                    ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white shadow-md dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820]"
                    : "text-[var(--text-secondary)] hover:bg-white/50 dark:hover:bg-cyan-900/30 hover:text-[var(--text-primary)]"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {sidebarExpanded && (
                  <span className="truncate">{lang === "mr" ? item.mr : item.en}</span>
                )}
              </button>
            );
          })}
        </nav>

        {sidebarExpanded && (
          <div className="p-3 m-2.5 rounded-xl bg-white/40 dark:bg-cyan-950/40 border border-white/50 dark:border-cyan-500/20 text-[10px] text-[var(--text-secondary)] space-y-1 shadow-xs">
            <div className="font-bold text-[#086B7B] dark:text-turquoise-300 flex items-center gap-1.5">
              <span>🌊</span>
              <span>FAO-56 · GSDA · ERA5</span>
            </div>
            <p className="leading-tight opacity-90">
              {lang === "mr" ? "पाणी-संतुलन हवामान बुद्धिमत्ता" : "Water-balance climate intelligence"}
            </p>
          </div>
        )}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-white/80 dark:bg-[#051E27]/90 backdrop-blur-xl h-full shadow-2xl p-4 flex flex-col justify-between border-r border-white/40 dark:border-cyan-500/30">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/40 dark:border-cyan-500/30">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-turquoise-400 to-[#086B7B] flex items-center justify-center text-white font-bold text-xs">
                    💧
                  </div>
                  <span className="font-bold text-sm text-[#074D5A] dark:text-turquoise-300">
                    {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-white/50"
                  aria-label="Close menu"
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
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                        active
                          ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820]"
                          : "text-[var(--text-secondary)] hover:bg-white/50"
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                      <span>{lang === "mr" ? item.mr : item.en}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] pt-3 border-t border-white/40 dark:border-cyan-500/30 font-medium">
              Climate Water Intelligence · Maharashtra
            </div>
          </div>
        </div>
      )}

      {/* Main Glass Content Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative z-10">
        {/* Sticky Frosted Glass Header */}
        <header className="sticky top-0 z-30 h-14 border-b border-white/40 dark:border-cyan-500/20 bg-white/45 dark:bg-[#03171F]/70 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-white/50 text-[#086B7B] dark:text-turquoise-300 transition"
              aria-label="Open navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-[#074D5A] dark:text-turquoise-300 truncate">
                {lang === "mr" ? "जल-कृषी AI" : "Jal-Krishi AI"}
              </span>
              <span className="hidden sm:inline-block text-[11px] font-medium text-[var(--text-secondary)] px-2 py-0.5 rounded-md bg-white/50 dark:bg-cyan-950/40 border border-white/50 dark:border-cyan-500/30 truncate">
                {analysis
                  ? `${lang === "mr" ? analysis.location.name_mr : analysis.location.name_en} · ${analysis.input.season}`
                  : lang === "mr"
                    ? "महाराष्ट्र हवामान व जल-संतुलन सल्लागार"
                    : "Climate & Water-Balance Platform"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Functional Interface Sound & Volume Controls */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/50 dark:border-cyan-500/30 bg-white/45 dark:bg-cyan-950/40 backdrop-blur-md">
              <button
                type="button"
                onClick={() => soundManager.toggleMuted()}
                className={`p-1.5 rounded-md transition flex items-center justify-center shrink-0 ${
                  soundState.isMuted
                    ? "bg-red-500/15 text-red-500 dark:text-red-400"
                    : "text-[#086B7B] dark:text-turquoise-300 hover:bg-white/60 dark:hover:bg-cyan-500/20"
                }`}
                title={soundState.isMuted ? "Unmute interface sound effects" : "Mute interface sounds"}
                aria-label={soundState.isMuted ? "Unmute sound" : "Mute sound"}
              >
                {soundState.isMuted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundState.isMuted ? 0 : soundState.volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (soundState.isMuted && v > 0) {
                      soundManager.setMuted(false);
                    }
                    soundManager.setVolume(v);
                  }}
                  className="w-14 sm:w-20 h-1.5 bg-cyan-200/60 dark:bg-cyan-900/60 rounded-lg appearance-none cursor-pointer accent-[#086B7B] dark:accent-turquoise-400"
                  title={`Interface sound volume: ${soundState.isMuted ? "0% (Muted)" : `${Math.round(soundState.volume * 100)}%`}`}
                  aria-label="Interface sound volume slider"
                />
                <span className="text-[10px] font-mono font-bold w-7 text-right text-[var(--text-secondary)]">
                  {soundState.isMuted ? "0%" : `${Math.round(soundState.volume * 100)}%`}
                </span>
              </div>
            </div>

            {/* Offline Simulation Toggle */}
            <button
              type="button"
              onClick={() => setSimulateOffline((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                simulateOffline
                  ? "bg-amberwarn-600 border-amberwarn-600 text-white shadow-xs"
                  : "border-white/50 dark:border-cyan-500/30 bg-white/50 dark:bg-cyan-950/40 text-[var(--text-secondary)] hover:bg-white/80"
              }`}
              title="Toggle simulated offline mode"
            >
              {simulateOffline
                ? lang === "mr"
                  ? "ऑफलाइन: चालू"
                  : "Offline: ON"
                : lang === "mr"
                  ? "ऑफलाइन सिम"
                  : "Offline Sim"}
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-white/50 dark:border-cyan-500/30 bg-white/50 dark:bg-cyan-950/40 text-[var(--text-secondary)] hover:bg-white/80 transition"
              aria-label="Toggle theme"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <svg className="w-4 h-4 text-turquoise-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[#086B7B]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setLang((l) => (l === "mr" ? "en" : "mr"))}
              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] text-xs font-bold shadow-xs transition"
              title="Switch language"
            >
              {lang === "mr" ? "English" : "मराठी"}
            </button>
          </div>
        </header>

        {/* Page Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
          {/* Global Offline / Demo Warning Banner (Opaque Warning) */}
          {analysis && analysis.weather_status.source_kind !== "LIVE" && (
            <div className="card-opaque border-l-4 border-l-amberwarn-600 bg-amberwarn-50 dark:bg-[#1E190E] p-4 text-xs text-amberwarn-700 dark:text-amberwarn-100 flex items-start gap-2.5 shadow-md">
              <span className="text-base shrink-0">⚠️</span>
              <div>
                <p className="font-semibold text-sm">
                  {analysis.weather_status.source_kind === "OFFLINE_DEMO"
                    ? lang === "mr"
                      ? "ऑफलाइन प्रात्यक्षिक मोड (Offline Demonstration Mode)"
                      : "Offline Demonstration Mode"
                    : lang === "mr"
                      ? "साठवलेला हवामान डेटा (Cached Weather)"
                      : "Cached Weather Data"}
                </p>
                <p className="mt-0.5 opacity-90 leading-relaxed">
                  {lang === "mr"
                    ? analysis.weather_status.source_label_mr
                    : analysis.weather_status.source_label_en}
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="card-opaque border-l-4 border-l-risk-600 bg-risk-50 dark:bg-[#251212] p-4 text-xs text-risk-700 dark:text-risk-100 shadow-md">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: BALANCED WELCOME & SETUP */}
          {tab === "setup" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Welcome & Quick Demo Presets (TRANSLUCENT GLASS) */}
              <section className="lg:col-span-5 card-translucent p-5 sm:p-6 space-y-4">
                <div className="space-y-2">
                  <span className="inline-block text-[11px] font-bold tracking-wider text-[#0E94A5] dark:text-turquoise-400 uppercase">
                    {lang === "mr" ? "महाराष्ट्र जल-बुद्धिमत्ता" : "Maharashtra Climate Intelligence"}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#074D5A] dark:text-turquoise-300 tracking-tight leading-snug">
                    {lang === "mr"
                      ? "पाणी-संतुलनावर आधारित अचूक पीक सल्ला"
                      : "Water-Balance Crop & Irrigation Intelligence"}
                  </h1>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    {lang === "mr"
                      ? "तालुकानिहाय भूजल पातळी (GSDA/CGWB), पाऊस अंदाज आणि FAO-56 पिकांची पाण्याची गरज तपासून पेरणीपूर्वी योग्य पीक निवडा किंवा उभ्या पिकाचे संरक्षण करा."
                      : "Evaluate local groundwater reliability, rainfall forecasts, and FAO-56 crop water demand to rank pre-sowing crops or protect standing crops."}
                  </p>
                </div>

                {/* Quick Demo Presets */}
                <div className="space-y-2.5 pt-4 border-t border-white/40 dark:border-cyan-500/20">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] block">
                    {lang === "mr" ? "द्रुत प्रात्यक्षिक निवडी (Quick Demos):" : "Quick Demo Presets:"}
                  </span>
                  <div className="grid grid-cols-1 gap-2.5">
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
                      className="text-left p-3.5 rounded-xl border border-white/50 dark:border-cyan-500/30 bg-white/40 dark:bg-cyan-950/40 hover:bg-white/70 dark:hover:bg-cyan-900/50 transition shadow-xs"
                    >
                      <div className="text-xs font-bold text-[#074D5A] dark:text-turquoise-300 flex items-center justify-between">
                        <span>{lang === "mr" ? "खरीप T3 प्रात्यक्षिक (लातूर, २० जून)" : "Kharif T3 Demo (Latur, Jun 20)"}</span>
                        <span className="text-[10px] bg-turquoise-500/20 text-[#074D5A] dark:text-turquoise-300 px-2 py-0.5 rounded-full font-bold">Demo</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                        {lang === "mr"
                          ? "कोरडवाहू · निम-संवेदनशील भूजल · प्रात्यक्षिक सराव"
                          : "Rainfed · Semi-Critical GW · Demonstration Scenario"}
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
                      className="text-left p-3.5 rounded-xl border border-white/50 dark:border-cyan-500/30 bg-white/40 dark:bg-cyan-950/40 hover:bg-white/70 dark:hover:bg-cyan-900/50 transition shadow-xs"
                    >
                      <div className="text-xs font-bold text-[#0E94A5] dark:text-turquoise-300 flex items-center justify-between">
                        <span>{lang === "mr" ? "सध्याचा रब्बी हंगाम (बारामती, आज)" : "Current Rabi (Baramati, Today)"}</span>
                        <span className="text-[10px] bg-[#0E94A5]/20 text-[#074D5A] dark:text-turquoise-300 px-2 py-0.5 rounded-full font-bold">Live</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                        {lang === "mr"
                          ? "मर्यादित सिंचन · १६-दिवसीय अंदाज + हवामान इतिहास"
                          : "Limited Irrig · 16-day forecast + ERA5 climatology"}
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              {/* Right Column: Main Input Form (TRANSLUCENT GLASS) */}
              <section className="lg:col-span-7 card-translucent p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/40 dark:border-cyan-500/20">
                  <h2 className="text-base font-bold text-[#074D5A] dark:text-turquoise-300">
                    {lang === "mr" ? "शेती आणि हंगाम माहिती" : "Farm & Season Parameters"}
                  </h2>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {lang === "mr" ? "स्थान व सिंचन निवडा" : "Configure parameters"}
                  </span>
                </div>

                {/* Pilot Location */}
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
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
                          locationId === loc.id
                            ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white border-transparent dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] shadow-md"
                            : "bg-white/40 dark:bg-cyan-950/40 text-[var(--text-primary)] border-white/50 dark:border-cyan-500/20 hover:bg-white/70"
                        }`}
                      >
                        {lang === "mr" ? loc.name_mr : loc.name_en}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Season & Advisory Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      {lang === "mr" ? "हंगाम" : "Season"}
                    </label>
                    <div className="flex rounded-xl border border-white/50 dark:border-cyan-500/30 overflow-hidden bg-white/40 dark:bg-cyan-950/40 p-0.5">
                      {(["KHARIF", "RABI"] as Season[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSeason(s)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                            season === s
                              ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] shadow-xs"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
                    <div className="flex rounded-xl border border-white/50 dark:border-cyan-500/30 overflow-hidden bg-white/40 dark:bg-cyan-950/40 p-0.5">
                      {(["PRE_SOWING", "POST_SOWING"] as Mode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                            mode === m
                              ? "bg-gradient-to-r from-[#0E94A5] to-turquoise-600 text-white dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] shadow-xs"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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

                {/* Sowing Date & Optional Standing Crop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      {lang === "mr" ? "पेरणीची तारीख" : "Sowing Date"}
                    </label>
                    <input
                      type="date"
                      value={sowingDate}
                      onChange={(e) => setSowingDate(e.target.value)}
                      className="w-full rounded-xl border border-white/50 dark:border-cyan-500/30 bg-white/50 dark:bg-cyan-950/50 px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-aqua-500/40 transition"
                    />
                  </div>

                  {mode === "POST_SOWING" ? (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                        {lang === "mr" ? "उभे पीक निवडा" : "Standing Crop"}
                      </label>
                      <select
                        value={standingCropId}
                        onChange={(e) => setStandingCropId(e.target.value)}
                        className="w-full rounded-xl border border-white/50 dark:border-cyan-500/30 bg-white/50 dark:bg-cyan-950/50 px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-aqua-500/40 transition"
                      >
                        {seasonCrops.map((c) => (
                          <option key={c.id} value={c.id}>
                            {lang === "mr" ? c.name_mr : c.name_en}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center text-xs text-[var(--text-secondary)] pt-6">
                      ℹ️ {lang === "mr" ? "हंगामातील सर्व पिकांची तुलना होईल" : "All season crops will be ranked"}
                    </div>
                  )}
                </div>

                {/* Irrigation Access */}
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
                            ? "bg-gradient-to-r from-[#0E94A5] to-turquoise-600 text-white border-transparent dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] shadow-xs"
                            : "bg-white/40 dark:bg-cyan-950/40 text-[var(--text-primary)] border-white/50 dark:border-cyan-500/20 hover:bg-white/70"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Action Button (Opaque Deep Flowing Aqua Action) */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setIsDemoScenario(false);
                    runAnalyze({ is_demo_scenario: false });
                  }}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#086B7B] via-[#0E94A5] to-turquoise-600 hover:opacity-95 text-white dark:from-turquoise-400 dark:to-aqua-400 dark:text-[#021820] font-bold text-sm shadow-lg transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white dark:text-[#021820]" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{lang === "mr" ? "पाणी-संतुलन गणना सुरू आहे..." : "Calculating water balance..."}</span>
                    </>
                  ) : (
                    <span>{lang === "mr" ? "विश्लेषण सुरू करा (Start Analysis)" : "Start Analysis"}</span>
                  )}
                </button>
              </section>
            </div>
          )}

          {/* TAB 2: ANALYSIS-FIRST DASHBOARD */}
          {tab === "results" && (
            <div className="space-y-6">
              {!analysis ? (
                <div className="card-translucent p-10 text-center text-sm text-[var(--text-secondary)] space-y-3">
                  <p className="font-semibold text-base">
                    {lang === "mr" ? "कोणतेही सक्रिय विश्लेषण उपलब्ध नाही." : "No active analysis found."}
                  </p>
                  <p className="text-xs">
                    {lang === "mr"
                      ? "कृपया आधी 'सेटअप' टॅबमधून माहिती भरून विश्लेषण सुरू करा."
                      : "Please configure farm parameters in the Setup tab and click Start Analysis."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab("setup")}
                    className="px-4 py-2 rounded-xl bg-[#086B7B] text-white dark:bg-turquoise-400 dark:text-[#021820] text-xs font-semibold"
                  >
                    {lang === "mr" ? "सेटअपकडे जा" : "Go to Setup"}
                  </button>
                </div>
              ) : (
                <>
                  {/* 1. KEY METRICS ROW — TRANSLUCENT GLASS (Water Background Clearly Shimmers Underneath) */}
                  {analysis.pre_sowing && topCrop && (
                    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {/* Metric 1: Top Ranked Crop */}
                      <div className="card-translucent p-4 sm:p-5 space-y-1">
                        <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase tracking-wider block">
                          {lang === "mr" ? "सर्वोत्तम पीक निवड" : "Top Ranked Crop"}
                        </span>
                        <div className="text-2xl font-black text-[#074D5A] dark:text-turquoise-300 mt-0.5">
                          {topCrop.scores.total}
                          <span className="text-xs font-normal text-[var(--text-secondary)]"> / 100</span>
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] block truncate">
                          {lang === "mr" ? topCrop.name_mr : topCrop.name_en}
                        </span>
                      </div>

                      {/* Metric 2: Available Water */}
                      <div className="card-translucent p-4 sm:p-5 space-y-1">
                        <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase tracking-wider block">
                          {lang === "mr" ? "उपलब्ध पाणी (पाऊस+सिंचन)" : "Total Available Water"}
                        </span>
                        <div className="text-2xl font-black text-[#0E94A5] dark:text-aqua-300 mt-0.5">
                          {Math.round(topCrop.effective_rain_mm + topCrop.reliable_irrigation_mm)}
                          <span className="text-xs font-normal text-[var(--text-secondary)]"> mm</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                          Pe: {topCrop.effective_rain_mm} mm · Irrig: {topCrop.reliable_irrigation_mm} mm
                        </span>
                      </div>

                      {/* Metric 3: Water Deficit / Gap */}
                      <div className="card-translucent p-4 sm:p-5 space-y-1">
                        <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase tracking-wider block">
                          {lang === "mr" ? "पाण्याची तूट (Gap)" : "Water Deficit (Gap)"}
                        </span>
                        <div className={`text-2xl font-black mt-0.5 ${topCrop.water_gap_mm > 0 ? "text-risk-600 dark:text-risk-400" : "text-[#074D5A] dark:text-turquoise-300"}`}>
                          {topCrop.water_gap_mm}
                          <span className="text-xs font-normal text-[var(--text-secondary)]"> mm</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                          {topCrop.water_gap_litres_per_acre.toLocaleString()} L/acre
                        </span>
                      </div>

                      {/* Metric 4: Groundwater Category */}
                      <div className="card-translucent p-4 sm:p-5 space-y-1">
                        <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase tracking-wider block">
                          {lang === "mr" ? "भूजल स्थिती (GSDA)" : "Groundwater (GSDA)"}
                        </span>
                        <div className="text-xl font-black text-[#074D5A] dark:text-turquoise-300 mt-0.5 truncate">
                          {analysis.groundwater.category}
                        </div>
                        <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                          {analysis.groundwater.stage_of_extraction_pct ?? "N/A"}% extraction
                        </span>
                      </div>
                    </section>
                  )}

                  {/* 2. SUPPORTING CONTEXT STRIP — TRANSLUCENT GLASS */}
                  <section className="card-translucent px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="font-bold text-[#074D5A] dark:text-turquoise-300 flex items-center gap-1.5">
                      <span>💧</span>
                      <span>
                        {lang === "mr" ? analysis.location.name_mr : analysis.location.name_en} ·{" "}
                        {analysis.input.season} · {analysis.input.sowing_date}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)]">
                        {lang === "mr"
                          ? analysis.weather_status.source_label_mr
                          : analysis.weather_status.source_label_en}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-white/60 dark:bg-cyan-950/60 border border-white/50 dark:border-cyan-500/30 font-bold text-[11px]">
                        {lang === "mr" ? "विश्वासार्हता: " : "Confidence: "}
                        {analysis.confidence.level}
                      </span>
                    </div>
                  </section>

                  {/* 3. MARATHI AI EXPLAINER — TRANSLUCENT GLASS */}
                  <section className="card-translucent p-5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#074D5A] dark:text-turquoise-300 flex items-center gap-1.5">
                        <span>🌱</span>
                        <span>{lang === "mr" ? "मराठी सारांश (AI स्पष्टीकरण)" : "Agronomic Summary (AI Explainer)"}</span>
                      </h3>
                      {explanation?.used_fallback && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/50 dark:bg-cyan-950/50 text-[var(--text-secondary)] border border-white/40 dark:border-cyan-500/30">
                          Deterministic Template
                        </span>
                      )}
                    </div>
                    {explainLoading ? (
                      <p className="text-xs text-[var(--text-secondary)] italic">
                        {lang === "mr" ? "स्पष्टीकरण तयार होत आहे..." : "Generating summary..."}
                      </p>
                    ) : explanation ? (
                      <p className="text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]">
                        {explanation.summary_mr}
                      </p>
                    ) : null}
                  </section>

                  {/* 4. OVERVIEW CHART: WATER DEMAND VS AVAILABILITY (TRANSLUCENT GLASS CONTAINER) */}
                  {analysis.pre_sowing && (
                    <section className="card-translucent p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div>
                          <h3 className="text-sm font-bold text-[#074D5A] dark:text-turquoise-300">
                            {lang === "mr"
                              ? "पिकांची पाण्याची मागणी विरुद्ध उपलब्धता तुलना (mm)"
                              : "Crop Water Balance Comparison (Demand vs Available vs Gap)"}
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            {lang === "mr"
                              ? "कमी तूट (Gap) असलेली पिके हवामान बदलात अधिक सुरक्षित ठरतात."
                              : "Crops with smaller water gaps offer superior climate safety."}
                          </p>
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] bg-white/50 dark:bg-cyan-950/50 px-2.5 py-1 rounded border border-white/50 dark:border-cyan-500/30 font-semibold">
                          FAO-56 Water Balance
                        </span>
                      </div>
                      <CropsComparisonBarChart crops={analysis.pre_sowing.ranked_crops} lang={lang} />
                    </section>
                  )}

                  {/* 5. PRE-SOWING: VISUAL RECOMMENDATION CARDS */}
                  {analysis.pre_sowing && (
                    <section className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[#074D5A] dark:text-turquoise-300">
                          {lang === "mr"
                            ? "पीक शिफारस कार्ड्स (तपशीलासाठी टॅप करा)"
                            : "Ranked Crop Recommendations (Tap to inspect)"}
                        </h3>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {analysis.pre_sowing.ranked_crops.length} {lang === "mr" ? "पिके विश्लेषित" : "crops analyzed"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {analysis.pre_sowing.ranked_crops.map((crop, idx) => {
                          const band = bandBadge(crop.band);
                          const risk = riskBadge(crop.water_risk);
                          const isTop = idx === 0;

                          return (
                            <button
                              key={crop.crop_id}
                              type="button"
                              onClick={() => {
                                setSelectedCropId(crop.crop_id);
                                setTab("detail");
                              }}
                              className={`text-left card-translucent p-4 sm:p-5 transition hover:shadow-lg space-y-3 relative overflow-hidden ${
                                isTop ? "border-2 border-turquoise-500 dark:border-turquoise-400 bg-white/60 dark:bg-[#072833]/65" : "hover:border-turquoise-400/50"
                              }`}
                            >
                              {isTop && (
                                <div className="absolute top-0 right-0 bg-gradient-to-r from-turquoise-500 to-[#086B7B] text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-xl shadow-xs">
                                  ★ {lang === "mr" ? "प्रथम शिफारस" : "Top Match"}
                                </div>
                              )}

                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#0E94A5] dark:text-turquoise-400">#{idx + 1}</span>
                                    <h4 className="text-base font-bold text-[var(--text-primary)]">
                                      {lang === "mr" ? crop.name_mr : crop.name_en}
                                    </h4>
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                    {crop.duration_days} {lang === "mr" ? "दिवस" : "days"} ·{" "}
                                    {lang === "mr" ? "स्थिरता:" : "Robustness:"} {crop.robustness.level}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-xl font-black text-[#074D5A] dark:text-turquoise-300">
                                    {crop.scores.total}
                                    <span className="text-xs font-normal text-[var(--text-secondary)]">/100</span>
                                  </div>
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] mt-0.5 ${band.cls}`}>
                                    {lang === "mr" ? band.mr : band.en}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/40 dark:border-cyan-500/20 text-[11px]">
                                <div>
                                  <span className="text-[var(--text-secondary)] block">
                                    {lang === "mr" ? "गरज (ETc)" : "Demand"}
                                  </span>
                                  <span className="font-bold">{crop.water_demand_etc_mm} mm</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-secondary)] block">
                                    {lang === "mr" ? "पाण्याची तूट" : "Water Gap"}
                                  </span>
                                  <span className={`font-bold ${crop.water_gap_mm > 0 ? "text-risk-600 dark:text-risk-400" : "text-[#074D5A] dark:text-turquoise-300"}`}>
                                    {crop.water_gap_mm} mm
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-secondary)] block">
                                    {lang === "mr" ? "पाणी जोखीम" : "Water Risk"}
                                  </span>
                                  <span className={risk.cls}>{lang === "mr" ? risk.mr : risk.en}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* 6. DETAILED COMPARISON TABLE — TRANSLUCENT GLASS */}
                  {analysis.pre_sowing && (
                    <section className="card-translucent p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[#074D5A] dark:text-turquoise-300">
                          {lang === "mr" ? "तुलनात्मक तक्ता (Crop Comparison Table)" : "Detailed Crop Comparison Table"}
                        </h3>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {lang === "mr" ? "तपशीलासाठी ओळीवर टॅप करा" : "Click row to view detail"}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-white/40 dark:border-cyan-500/20 text-[var(--text-secondary)] font-semibold">
                              <th className="py-2.5 pr-3">{lang === "mr" ? "पीक" : "Crop"}</th>
                              <th className="py-2.5 px-2">{lang === "mr" ? "एकूण गुण" : "Score"}</th>
                              <th className="py-2.5 px-2">{lang === "mr" ? "कालावधी" : "Duration"}</th>
                              <th className="py-2.5 px-2">{lang === "mr" ? "गरज (ETc mm)" : "ETc (mm)"}</th>
                              <th className="py-2.5 px-2">{lang === "mr" ? "तूट (Gap mm)" : "Gap (mm)"}</th>
                              <th className="py-2.5 px-2">{lang === "mr" ? "तूट (L/एकर)" : "Deficit (L/ac)"}</th>
                              <th className="py-2.5 pl-2">{lang === "mr" ? "जोखीम" : "Risk"}</th>
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
                                className="border-b border-white/30 dark:border-cyan-500/15 last:border-0 hover:bg-white/50 dark:hover:bg-cyan-900/30 cursor-pointer transition"
                              >
                                <td className="py-3 pr-3 font-semibold">
                                  <span className="text-turquoise-500 mr-1.5">#{idx + 1}</span>
                                  {lang === "mr" ? crop.name_mr : crop.name_en}
                                </td>
                                <td className="py-3 px-2 font-bold text-[#074D5A] dark:text-turquoise-300">
                                  {crop.scores.total}/100
                                </td>
                                <td className="py-3 px-2 text-[var(--text-secondary)]">
                                  {crop.duration_days} {lang === "mr" ? "दिवस" : "d"}
                                </td>
                                <td className="py-3 px-2">{crop.water_demand_etc_mm}</td>
                                <td className={`py-3 px-2 font-bold ${crop.water_gap_mm > 0 ? "text-risk-600 dark:text-risk-400" : "text-[#074D5A] dark:text-turquoise-300"}`}>
                                  {crop.water_gap_mm}
                                </td>
                                <td className="py-3 px-2 text-[var(--text-secondary)]">
                                  {crop.water_gap_litres_per_acre.toLocaleString()}
                                </td>
                                <td className="py-3 pl-2">
                                  <span className="font-semibold text-[11px]">{crop.water_risk}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* 7. POST-SOWING GUIDANCE (IF POST-SOWING SELECTED) */}
                  {analysis.post_sowing && (
                    <section className="space-y-4">
                      {/* Standing Crop Status Glass Card */}
                      <div className="card-translucent border-2 border-turquoise-500/40 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase">
                              {lang === "mr" ? "उभे पीक स्थिती" : "Standing Crop Status"}
                            </span>
                            <h3 className="text-lg font-bold">
                              {lang === "mr" ? analysis.post_sowing.name_mr : analysis.post_sowing.name_en}
                            </h3>
                          </div>
                          <span className="text-xs font-bold bg-turquoise-500/20 text-[#074D5A] dark:text-turquoise-300 px-3 py-1 rounded-full border border-turquoise-500/30">
                            {analysis.post_sowing.days_since_sowing} {lang === "mr" ? "दिवस पूर्ण" : "days since sowing"}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          {lang === "mr" ? "सध्याची अवस्था: " : "Current Stage: "}
                          <span className="text-[var(--text-primary)]">
                            {lang === "mr"
                              ? analysis.post_sowing.current_stage_label_mr
                              : analysis.post_sowing.current_stage_label_en}
                          </span>
                        </p>
                        <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-white/40 dark:border-cyan-500/20 text-xs">
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "१४ दिवस गरज" : "14-day Demand"}
                            </span>
                            <span className="font-bold text-sm">{analysis.post_sowing.next_14d_etc_mm} mm</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "अपेक्षित पाऊस" : "14-day Rain"}
                            </span>
                            <span className="font-bold text-sm">{analysis.post_sowing.next_14d_forecast_rain_mm} mm</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)] block text-[11px]">
                              {lang === "mr" ? "पाण्याची तूट" : "14-day Deficit"}
                            </span>
                            <span className="font-bold text-sm text-risk-600 dark:text-risk-400">
                              {analysis.post_sowing.next_14d_deficit_mm} mm
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Guidance Action Cards */}
                      {analysis.post_sowing.guidance_cards.map((card) => (
                        <div
                          key={card.id}
                          className="card-translucent p-4 sm:p-5 space-y-1.5 shadow-xs"
                        >
                          <div className="text-sm font-bold text-[#074D5A] dark:text-turquoise-300">
                            {lang === "mr" ? card.title_mr : card.title_en}
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                            {lang === "mr" ? card.body_mr : card.body_en}
                          </p>
                          <div className="text-[10px] text-[var(--text-secondary)] font-medium pt-1">
                            {card.source_note}
                          </div>
                        </div>
                      ))}

                      {/* Limitations Section */}
                      <div className="card-translucent p-4 sm:p-5 space-y-2 border-amberwarn-600/30">
                        <h4 className="text-xs font-bold text-amberwarn-700 dark:text-amberwarn-100">
                          {lang === "mr" ? "आम्ही काय ठरवू शकत नाही (Boundaries & Limitations):" : "What we cannot decide:"}
                        </h4>
                        <ul className="list-disc pl-4 text-xs text-[var(--text-secondary)] space-y-1 leading-relaxed">
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
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setTab("results")}
                className="text-xs font-bold text-[#074D5A] dark:text-turquoise-300 hover:underline flex items-center gap-1.5"
              >
                <span>←</span>
                <span>{lang === "mr" ? "सर्व पिकांच्या डॅशबोर्डकडे परत जा" : "Back to Dashboard"}</span>
              </button>

              {/* Crop Hero Card — TRANSLUCENT GLASS */}
              <section className="card-translucent p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-[#0E94A5] dark:text-turquoise-400 uppercase tracking-wider">
                      {lang === "mr" ? "तपशीलवार पीक विश्लेषण" : "Detailed Crop Analysis"}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                      {lang === "mr" ? selectedCrop.name_mr : selectedCrop.name_en}
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-[#074D5A] dark:text-turquoise-300">
                      {selectedCrop.scores.total}
                      <span className="text-xs font-normal text-[var(--text-secondary)]"> / 100</span>
                    </span>
                    <div className="text-[11px] font-semibold text-[#0E94A5] dark:text-turquoise-400">
                      {lang === "mr" ? "अनुकूलता गुण" : "Suitability Score"}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--text-secondary)] leading-relaxed pt-2 border-t border-white/40 dark:border-cyan-500/20 flex flex-wrap gap-4">
                  <span>
                    {lang === "mr" ? "पाण्याची तूट: " : "Water Gap: "}
                    <strong className="text-[var(--text-primary)]">{selectedCrop.water_gap_mm} mm</strong> (
                    {selectedCrop.water_gap_litres_per_acre.toLocaleString()} L/acre)
                  </span>
                  <span>
                    {lang === "mr" ? "अंदाज कव्हरेज: " : "Forecast coverage: "}
                    <strong className="text-[var(--text-primary)]">{selectedCrop.forecast_coverage_days}d / {selectedCrop.duration_days}d</strong>
                  </span>
                </div>

                {/* What-If Simulation Controls */}
                <div className="rounded-xl bg-white/40 dark:bg-cyan-950/40 border border-white/50 dark:border-cyan-500/20 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#074D5A] dark:text-turquoise-300">
                      {lang === "mr" ? "जर-तर (What-If) पाऊस बदल:" : "What-If Rainfall Multiplier:"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-white/60 dark:bg-cyan-900/50 border border-white/50 dark:border-cyan-500/30 font-bold">
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
                    className="w-full cursor-pointer"
                  />
                  <div className="flex gap-2 pt-1">
                    {(
                      [
                        ["NORMAL", lang === "mr" ? "सामान्य (Normal)" : "Normal"],
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
                            ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white border-transparent dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820]"
                            : "bg-white/40 dark:bg-cyan-950/40 border-white/50 dark:border-cyan-500/20 text-[var(--text-secondary)] hover:bg-white/70"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Dual Charts Grid — TRANSLUCENT GLASS CONTAINERS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="card-translucent p-4 sm:p-5 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#074D5A] dark:text-turquoise-300">
                    {lang === "mr" ? "पाण्याची मागणी विरुद्ध पुरवठा (mm)" : "Water Demand vs Supply (mm)"}
                  </h3>
                  <WaterBalanceBarChart crop={selectedCrop} lang={lang} />
                </section>

                <section className="card-translucent p-4 sm:p-5 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#074D5A] dark:text-turquoise-300">
                    {lang === "mr" ? "गुण विभागणी (Score Breakdown)" : "Score Breakdown (Waterfall)"}
                  </h3>
                  <ScoreWaterfallChart crop={selectedCrop} lang={lang} />
                </section>
              </div>

              {/* Crop Phenological Stages Timeline */}
              <section className="card-translucent p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#074D5A] dark:text-turquoise-300">
                  {lang === "mr" ? "पीक अवस्था वेळापत्रक (Phenological Timeline)" : "Crop Stage Timeline"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedCrop.stages.map((st) => (
                    <div
                      key={st.stage}
                      className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                        st.is_critical
                          ? "bg-amberwarn-50/80 dark:bg-amberwarn-900/30 border-amberwarn-600/40"
                          : "card-translucent border-white/50 dark:border-cyan-500/20"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text-primary)]">{lang === "mr" ? st.label_mr : st.label_en}</span>
                          {st.is_critical && (
                            <span className="text-[10px] bg-amberwarn-600 text-white px-2 py-0.2 rounded-full font-bold">
                              Critical
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {st.start_date} → {st.end_date} ({st.days} {lang === "mr" ? "दिवस" : "d"})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm">ETc: {st.etc_mm} mm</div>
                        <div className="text-[11px] text-turquoise-600 dark:text-turquoise-400">Pe: {st.effective_rain_mm} mm</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: MARATHI ASSISTANT — TRANSLUCENT GLASS */}
          {tab === "assistant" && (
            <section className="card-translucent p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/40 dark:border-cyan-500/20">
                <h2 className="text-base font-bold text-[#074D5A] dark:text-turquoise-300 flex items-center gap-2">
                  <span>💬</span>
                  <span>{lang === "mr" ? "मराठी पाणी-संतुलन सहाय्यक" : "Marathi Water-Balance Assistant"}</span>
                </h2>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {lang === "mr" ? "पिकांच्या पाण्यासंदर्भात प्रश्न विचारा" : "Ask questions in Marathi"}
                </span>
              </div>

              {!analysis ? (
                <div className="p-6 text-center text-xs text-[var(--text-secondary)] space-y-2">
                  <p>{lang === "mr" ? "प्रश्न विचारण्यापूर्वी कृपया 'सेटअप' मधून विश्लेषण सुरू करा." : "Please run an analysis first before asking questions."}</p>
                  <button
                    type="button"
                    onClick={() => setTab("setup")}
                    className="px-3 py-1.5 rounded-lg bg-[#086B7B] text-white dark:bg-turquoise-400 dark:text-[#021820] font-semibold text-xs"
                  >
                    {lang === "mr" ? "सेटअपकडे जा" : "Go to Setup"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-[var(--text-secondary)] font-semibold block">
                      {lang === "mr" ? "उदाहरणे (Tap to ask):" : "Sample queries:"}
                    </span>
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
                          className="text-left text-[11px] bg-white/40 dark:bg-cyan-950/40 hover:bg-white/70 border border-white/50 dark:border-cyan-500/20 rounded-lg px-2.5 py-1.5 transition text-[var(--text-primary)]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendChat(chatInput)}
                      placeholder={lang === "mr" ? "मराठीत प्रश्न विचारा..." : "Ask a question in Marathi..."}
                      className="flex-1 rounded-xl border border-white/50 dark:border-cyan-500/30 bg-white/50 dark:bg-cyan-950/50 px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-aqua-500/40 transition"
                    />
                    <button
                      type="button"
                      disabled={chatLoading || !chatInput.trim()}
                      onClick={() => sendChat(chatInput)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820] text-xs font-bold transition disabled:opacity-50"
                    >
                      {chatLoading ? "..." : lang === "mr" ? "विचारा" : "Ask"}
                    </button>
                  </div>

                  <div className="space-y-2.5 pt-2 max-h-96 overflow-y-auto">
                    {chatHistory.map((item, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-3.5 text-xs space-y-1.5 border shadow-xs ${
                          item.refused
                            ? "bg-amberwarn-50 dark:bg-amberwarn-900/30 border-amberwarn-600/40 text-amberwarn-700 dark:text-amberwarn-100"
                            : "bg-white/50 dark:bg-cyan-950/50 border-white/50 dark:border-cyan-500/30 text-[var(--text-primary)]"
                        }`}
                      >
                        <div className="font-bold">प्र: {item.q}</div>
                        <div className="leading-relaxed whitespace-pre-wrap">{item.a}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* TAB 5: DATA TRANSPARENCY & PROVENANCE — TRANSLUCENT GLASS */}
          {tab === "transparency" && (
            <section className="card-translucent p-5 sm:p-6 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/40 dark:border-cyan-500/20">
                <h2 className="text-base font-bold text-[#074D5A] dark:text-turquoise-300">
                  {lang === "mr" ? "डेटा स्रोत आणि पारदर्शकता" : "Data Sources & Provenance"}
                </h2>
                <span className="text-[11px] text-[var(--text-secondary)] font-semibold">Climate Rigor</span>
              </div>
              <div className="space-y-2.5 leading-relaxed text-[var(--text-secondary)]">
                <p>
                  <strong className="text-[var(--text-primary)]">Groundwater (भूजल):</strong> Dynamic Groundwater Resources of Maharashtra 2023
                  (Published March 2024, GSDA/CGWB, GWRE-State-Report-2022-23). Latur: Semi-Critical
                  (70.7%), Baramati: Semi-Critical (80.4%), Nagpur: Safe (46.5%). Static verified baseline.
                </p>
                <p>
                  <strong className="text-[var(--text-primary)]">Weather (हवामान):</strong> Open-Meteo 16-day Ensemble Forecast (Asia/Kolkata). Fallback chain:
                  Live → Cached last-live (localStorage) → Offline Demonstration Sample.
                </p>
                <p>
                  <strong className="text-[var(--text-primary)]">Climatology P20/P80:</strong> Coherent historical-year annual precipitation
                  sequences (2015–2025 ERA5-Land) when built, or clearly labelled prototype regional fallback.
                </p>
                <p>
                  <strong className="text-[var(--text-primary)]">Crop Parameters (पीक गुणधर्म):</strong> FAO-56 Table 12 crop coefficients (Kc) cross-checked;
                  durations, sowing windows, and scoring weights are transparently documented.
                </p>
              </div>
              {analysis && (
                <p className="text-[11px] text-[var(--text-secondary)] pt-3 border-t border-white/40 dark:border-cyan-500/20 font-medium">
                  Engine v{analysis.engine_version} · Catalogue v{analysis.catalogue_version} · Config v{analysis.config_version}
                </p>
              )}
            </section>
          )}

          {/* TAB 6: LOCAL HISTORY — TRANSLUCENT GLASS */}
          {tab === "history" && (
            <section className="card-translucent p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/40 dark:border-cyan-500/20">
                <h2 className="text-base font-bold text-[#074D5A] dark:text-turquoise-300">
                  {lang === "mr" ? "स्थानिक इतिहास (History)" : "Local History"}
                </h2>
                <span className="text-[11px] text-[var(--text-secondary)] font-semibold">
                  {compareIds.length} / 3 {lang === "mr" ? "निवडलेले" : "selected for comparison"}
                </span>
              </div>

              {history.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  {lang === "mr" ? "अजून कोणतीही नोंद जतन केलेली नाही." : "No saved analysis runs yet."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {history.map((snap) => {
                    const checked = compareIds.includes(snap.id);
                    const top = snap.analysis.pre_sowing?.ranked_crops[0];
                    return (
                      <div
                        key={snap.id}
                        className="card-translucent p-3.5 text-xs flex items-center justify-between gap-3 shadow-xs"
                      >
                        <div>
                          <div className="font-bold text-[var(--text-primary)]">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}{" "}
                            · {snap.analysis.input.season} · {snap.analysis.input.mode}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
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
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                            checked
                              ? "bg-gradient-to-r from-[#086B7B] to-[#0E94A5] text-white border-transparent dark:from-turquoise-500 dark:to-aqua-400 dark:text-[#021820]"
                              : "bg-white/40 dark:bg-cyan-950/40 border-white/50 dark:border-cyan-500/20 text-[var(--text-secondary)] hover:bg-white/70"
                          }`}
                        >
                          {checked
                            ? lang === "mr"
                              ? "निवडले ✓"
                              : "Selected ✓"
                            : lang === "mr"
                              ? "तुलना करा"
                              : "Compare"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {compareIds.length >= 2 && (
                <div className="pt-4 border-t border-white/40 dark:border-cyan-500/20 space-y-2.5">
                  <h3 className="text-xs font-bold text-[#074D5A] dark:text-turquoise-300">
                    {lang === "mr" ? "तुलना (Side-by-Side Comparison)" : "Side-by-Side Comparison"}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {compareIds.map((id) => {
                      const snap = history.find((h) => h.id === id);
                      if (!snap) return null;
                      const top = snap.analysis.pre_sowing?.ranked_crops[0];
                      return (
                        <div
                          key={id}
                          className="card-translucent p-3 text-[11px] space-y-1.5 shadow-xs"
                        >
                          <div className="font-bold text-sm text-[var(--text-primary)]">
                            {lang === "mr"
                              ? snap.analysis.location.name_mr
                              : snap.analysis.location.name_en}
                          </div>
                          <div className="text-[var(--text-secondary)]">{snap.analysis.input.sowing_date}</div>
                          <div>GW: <span className="font-semibold">{snap.analysis.groundwater.category}</span></div>
                          {top && (
                            <div className="font-semibold text-[#074D5A] dark:text-turquoise-300 pt-1 border-t border-white/40 dark:border-cyan-500/20">
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
