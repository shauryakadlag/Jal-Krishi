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
      fill: "#385A54",
    },
    {
      name: lang === "mr" ? "प्रभावी पाऊस" : "Eff. Rain",
      mm: crop.effective_rain_mm,
      fill: "#779AA0",
    },
    {
      name: lang === "mr" ? "सिंचन" : "Rel. Irrig.",
      mm: crop.reliable_irrigation_mm,
      fill: "#A6BDB0",
    },
    {
      name: lang === "mr" ? "तूट (Gap)" : "Water Gap",
      mm: crop.water_gap_mm,
      fill: crop.water_gap_mm > 0 ? "#B83B35" : "#385A54",
    },
  ];

  return (
    <div className="h-60 w-full rounded-lg bg-[#FBFBF9] dark:bg-[#182420] p-3 border border-[var(--border-subtle)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -6, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            strokeOpacity={0.8}
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 500 }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
            unit=" mm"
          />
          <Tooltip
            formatter={(val: number) => [`${val} mm`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
      fill: "#779AA0",
    },
    {
      name: lang === "mr" ? "अवस्था (20%)" : "Stage (20%)",
      score: crop.scores.stage_fit,
      fill: "#385A54",
    },
    {
      name: lang === "mr" ? "हंगाम (20%)" : "Season (20%)",
      score: crop.scores.season_fit,
      fill: "#A6BDB0",
    },
    {
      name: lang === "mr" ? "उष्णता (15%)" : "Heat (15%)",
      score: crop.scores.heat_fit,
      fill: "#A86A14",
    },
  ];

  return (
    <div className="h-60 w-full rounded-lg bg-[#FBFBF9] dark:bg-[#182420] p-3 border border-[var(--border-subtle)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            strokeOpacity={0.8}
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 500 }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <Tooltip
            formatter={(val: number) => [`${val} / 100`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
    <div className="h-72 w-full rounded-lg bg-[#FBFBF9] dark:bg-[#182420] p-3 border border-[var(--border-subtle)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -6, bottom: 6 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            strokeOpacity={0.8}
            vertical={true}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 500 }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
            unit=" mm"
          />
          <Tooltip
            formatter={(val: number, name: string) => [`${val} mm`, name]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          />
          <Legend
            verticalAlign="top"
            height={32}
            wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
          />
          <Bar name={labelDemand} dataKey="demand" fill="#385A54" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar name={labelAvailable} dataKey="available" fill="#779AA0" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar name={labelGap} dataKey="gap" fill="#B83B35" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
