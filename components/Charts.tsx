"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CropAnalysisResult } from "@/lib/types";

interface ChartProps {
  crop: CropAnalysisResult;
  lang: "mr" | "en";
}

interface MultiCropChartProps {
  crops: CropAnalysisResult[];
  lang: "mr" | "en";
}

export function WaterBalanceBarChart({ crop, lang }: ChartProps) {
  const data = [
    {
      name: lang === "mr" ? "गरज (ETc)" : "Demand (ETc)",
      mm: crop.water_demand_etc_mm,
      fill: "#086B7B", // Deep Ocean Teal
    },
    {
      name: lang === "mr" ? "प्रभावी पाऊस" : "Eff. Rain",
      mm: crop.effective_rain_mm,
      fill: "#2EC4B6", // Vibrant Turquoise
    },
    {
      name: lang === "mr" ? "सिंचन" : "Rel. Irrig.",
      mm: crop.reliable_irrigation_mm,
      fill: "#16B6C7", // Bright Aqua
    },
    {
      name: lang === "mr" ? "तूट (Gap)" : "Water Gap",
      mm: crop.water_gap_mm,
      fill: crop.water_gap_mm > 0 ? "#D94E4E" : "#086B7B",
    },
  ];

  return (
    <div className="h-60 w-full rounded-xl bg-white/25 dark:bg-[#07242E]/25 backdrop-blur-md p-3 border border-white/40 dark:border-cyan-400/15 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -6, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(46, 196, 182, 0.22)"
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
            unit=" mm"
          />
          <Tooltip
            formatter={(val: number) => [`${val} mm`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              borderColor: "rgba(46, 196, 182, 0.4)",
              color: "#084D5E",
              boxShadow: "0 8px 24px rgba(3, 42, 54, 0.15)",
              backdropFilter: "blur(8px)",
            }}
          />
          <Bar dataKey="mm" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreWaterfallChart({ crop, lang }: ChartProps) {
  const data = [
    {
      name: lang === "mr" ? "पाणी (45%)" : "Water (45%)",
      score: crop.scores.water_fit,
      fill: "#2EC4B6", // Turquoise
    },
    {
      name: lang === "mr" ? "अवस्था (20%)" : "Stage (20%)",
      score: crop.scores.stage_fit,
      fill: "#086B7B", // Deep Teal
    },
    {
      name: lang === "mr" ? "हंगाम (20%)" : "Season (20%)",
      score: crop.scores.season_fit,
      fill: "#16B6C7", // Aqua
    },
    {
      name: lang === "mr" ? "उष्णता (15%)" : "Heat (15%)",
      score: crop.scores.heat_fit,
      fill: "#D48B28", // Warm Sunlight Amber
    },
  ];

  return (
    <div className="h-60 w-full rounded-xl bg-white/25 dark:bg-[#07242E]/25 backdrop-blur-md p-3 border border-white/40 dark:border-cyan-400/15 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(46, 196, 182, 0.22)"
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(val: number) => [`${val} / 100`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              borderColor: "rgba(46, 196, 182, 0.4)",
              color: "#084D5E",
              boxShadow: "0 8px 24px rgba(3, 42, 54, 0.15)",
              backdropFilter: "blur(8px)",
            }}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CropsComparisonBarChart({ crops, lang }: MultiCropChartProps) {
  const data = crops.map((c) => ({
    name: lang === "mr" ? c.name_mr : c.name_en,
    demand: c.water_demand_etc_mm,
    available: Math.round(c.effective_rain_mm + c.reliable_irrigation_mm),
    gap: c.water_gap_mm,
  }));

  const labelDemand = lang === "mr" ? "पाण्याची गरज (ETc)" : "Water Demand (ETc)";
  const labelAvailable = lang === "mr" ? "उपलब्ध पाणी (पाऊस+सिंचन)" : "Available Water";
  const labelGap = lang === "mr" ? "पाण्याची तूट (Gap)" : "Water Deficit";

  return (
    <div className="h-72 w-full rounded-xl bg-white/25 dark:bg-[#07242E]/25 backdrop-blur-md p-3 border border-white/40 dark:border-cyan-400/15 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -6, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(46, 196, 182, 0.22)"
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "rgba(46, 196, 182, 0.3)" }}
            tickLine={false}
            unit=" mm"
          />
          <Tooltip
            formatter={(val: number, name: string) => [`${val} mm`, name]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              backgroundColor: "rgba(255, 255, 255, 0.85)",
              borderColor: "rgba(46, 196, 182, 0.4)",
              color: "#084D5E",
              boxShadow: "0 8px 24px rgba(3, 42, 54, 0.15)",
              backdropFilter: "blur(8px)",
            }}
          />
          <Legend
            verticalAlign="top"
            height={32}
            wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
          />
          <Bar name={labelDemand} dataKey="demand" fill="#086B7B" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar name={labelAvailable} dataKey="available" fill="#2EC4B6" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar name={labelGap} dataKey="gap" fill="#D94E4E" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
