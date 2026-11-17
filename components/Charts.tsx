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
      fill: "#8c5a2b",
    },
    {
      name: lang === "mr" ? "प्रभावी पाऊस" : "Eff. Rain",
      mm: crop.effective_rain_mm,
      fill: "#0277bd",
    },
    {
      name: lang === "mr" ? "विश्वसनीय सिंचन" : "Rel. Irrig.",
      mm: crop.reliable_irrigation_mm,
      fill: "#2e7d32",
    },
    {
      name: lang === "mr" ? "पाण्याची तूट" : "Water Gap",
      mm: crop.water_gap_mm,
      fill: "#c62828",
    },
  ];

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6d3b8" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#36210f" }} />
          <YAxis tick={{ fontSize: 11, fill: "#36210f" }} unit=" mm" />
          <Tooltip
            formatter={(val: number) => [`${val} mm`, ""]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="mm" radius={[6, 6, 0, 0]}>
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
      fill: "#0277bd",
    },
    {
      name: lang === "mr" ? "अवस्था (20%)" : "Stage (20%)",
      score: crop.scores.stage_fit,
      fill: "#2e7d32",
    },
    {
      name: lang === "mr" ? "हंगाम (20%)" : "Season (20%)",
      score: crop.scores.season_fit,
      fill: "#8c5a2b",
    },
    {
      name: lang === "mr" ? "उष्णता (15%)" : "Heat (15%)",
      score: crop.scores.heat_fit,
      fill: "#b26a00",
    },
  ];

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6d3b8" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#36210f" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#36210f" }} />
          <Tooltip
            formatter={(val: number) => [`${val} / 100`, ""]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="score" radius={[6, 6, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
