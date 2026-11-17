"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CropAnalysisResult } from "@/lib/types";

export function WaterBalanceBarChart({
  crop,
  lang,
}: {
  crop: CropAnalysisResult;
  lang: "mr" | "en";
}) {
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
      fill: "#B83B35",
    },
  ];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
            unit=" mm"
          />
          <Tooltip
            formatter={(val: number) => [`${val} mm`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
          <Bar dataKey="mm" radius={[8, 8, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreWaterfallChart({
  crop,
  lang,
}: {
  crop: CropAnalysisResult;
  lang: "mr" | "en";
}) {
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
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(val: number) => [`${val} / 100`, ""]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
          <Bar dataKey="score" radius={[8, 8, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
