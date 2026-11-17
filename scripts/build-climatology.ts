/**
 * Build-time script: fetches Open-Meteo Historical Archive (2015-2025) for all pilot locations
 * and writes versioned climatology JSON to /data/climatology/<id>.json.
 *
 * P20/P80 method (coherent historical-year sequences):
 * For each location, we compute total annual precipitation for each complete year (2015..2025),
 * sort the years by total precipitation, and select:
 *   - Dry year (P20): the year at floor(0.20 * (N - 1))
 *   - Wet year (P80): the year at floor(0.80 * (N - 1))
 * Their actual daily precipitation sequences are stored as rain_mm_dry_p20 and rain_mm_wet_p80,
 * preserving realistic dry spells and monsoon bursts rather than combining independent daily percentiles.
 */

import fs from "node:fs";
import path from "node:path";
import locations from "../data/locations.json";
import { CLIMATOLOGY_VERSION } from "../lib/versions";
import type { ClimatologyDay, ClimatologyFile } from "../lib/types";

const START_DATE = "2015-01-01";
const END_DATE = "2025-12-31";

function dayOfYear(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const curr = Date.UTC(y, m - 1, d);
  const doy = Math.floor((curr - start) / 86400000) + 1;
  return Math.min(365, Math.max(1, doy));
}

async function buildForLocation(loc: (typeof locations)[number]): Promise<void> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&start_date=${START_DATE}&end_date=${END_DATE}` +
    `&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max` +
    `&timezone=Asia%2FKolkata`;

  console.log(`Fetching Open-Meteo Archive for ${loc.name_en} (${loc.lat}, ${loc.lon})...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo Archive failed for ${loc.id}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    daily: {
      time: string[];
      precipitation_sum: (number | null)[];
      et0_fao_evapotranspiration: (number | null)[];
      temperature_2m_max: (number | null)[];
    };
  };

  const byYear: Record<string, { totalRain: number; byDoy: Record<number, number> }> = {};
  const doyAgg: Record<number, { rain: number[]; et0: number[]; tmax: number[] }> = {};

  for (let d = 1; d <= 365; d++) {
    doyAgg[d] = { rain: [], et0: [], tmax: [] };
  }

  for (let i = 0; i < json.daily.time.length; i++) {
    const dateStr = json.daily.time[i];
    const year = dateStr.slice(0, 4);
    const doy = dayOfYear(dateStr);
    const rain = json.daily.precipitation_sum[i] ?? 0;
    const et0 = json.daily.et0_fao_evapotranspiration[i] ?? 4.5;
    const tmax = json.daily.temperature_2m_max[i] ?? 32;

    if (!byYear[year]) byYear[year] = { totalRain: 0, byDoy: {} };
    byYear[year].totalRain += rain;
    byYear[year].byDoy[doy] = rain;

    doyAgg[doy].rain.push(rain);
    doyAgg[doy].et0.push(et0);
    doyAgg[doy].tmax.push(tmax);
  }

  const sortedYears = Object.entries(byYear).sort((a, b) => a[1].totalRain - b[1].totalRain);
  const dryYear = sortedYears[Math.floor(0.2 * (sortedYears.length - 1))][0];
  const wetYear = sortedYears[Math.floor(0.8 * (sortedYears.length - 1))][0];

  const avg = (arr: number[]) =>
    arr.length ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2)) : 0;

  const days: ClimatologyDay[] = [];
  for (let d = 1; d <= 365; d++) {
    days.push({
      doy: d,
      rain_mm_mean: avg(doyAgg[d].rain),
      et0_mm_mean: avg(doyAgg[d].et0),
      tmax_c_mean: avg(doyAgg[d].tmax),
      rain_mm_dry_p20: Number((byYear[dryYear].byDoy[d] ?? 0).toFixed(2)),
      rain_mm_wet_p80: Number((byYear[wetYear].byDoy[d] ?? 0).toFixed(2)),
    });
  }

  const out: ClimatologyFile = {
    location_id: loc.id,
    climatology_version: CLIMATOLOGY_VERSION,
    source: `Open-Meteo Historical Archive (ERA5-Land, ${START_DATE} to ${END_DATE})`,
    period: `${START_DATE} to ${END_DATE}`,
    p20_p80_method: `Coherent historical-year sequences: dry_p20=${dryYear}, wet_p80=${wetYear}`,
    is_fallback_sample: false,
    days,
  };

  const outDir = path.resolve(process.cwd(), "data", "climatology");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${loc.id}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote data/climatology/${loc.id}.json (dry=${dryYear}, wet=${wetYear})`);
}

async function main() {
  for (const loc of locations) {
    await buildForLocation(loc);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
