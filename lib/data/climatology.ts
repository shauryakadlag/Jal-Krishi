import fs from "node:fs";
import path from "node:path";
import type { ClimatologyDay, ClimatologyFile } from "../types";
import { CLIMATOLOGY_VERSION } from "../versions";

/**
 * Generates a clearly-labelled fallback climatology curve for Maharashtra zones
 * when committed ERA5-Land JSON files have not been generated yet (e.g. offline sandbox).
 * Marked is_fallback_sample: true so UI and provenance never misrepresent it as ERA5-Land.
 */
function buildFallbackClimatology(locationId: string): ClimatologyFile {
  const annualScale =
    locationId === "nagpur" ? 1.35 : locationId === "baramati" ? 0.72 : 1.0;

  const days: ClimatologyDay[] = [];
  for (let doy = 1; doy <= 365; doy++) {
    // Monsoon peak around DOY 195 (mid-July) to 255 (mid-Sept)
    let baseRain = 0.2;
    if (doy >= 155 && doy <= 275) {
      const monsoonPhase = Math.sin(((doy - 155) / 120) * Math.PI);
      baseRain = 7.5 * Math.pow(Math.max(0, monsoonPhase), 1.3);
    } else if (doy >= 276 && doy <= 305) {
      baseRain = 1.6 * (1 - (doy - 276) / 30);
    }

    // ET0 peaks in April-May (DOY 110-145 ~ 6.5 mm/day), lower in monsoon/winter (~3.8-4.5)
    const et0 =
      4.3 +
      1.6 * Math.sin(((doy - 45) / 365) * 2 * Math.PI) -
      (doy >= 170 && doy <= 255 ? 0.9 : 0);

    // Tmax peaks in May (~40 C), cooler in Dec-Jan (~29 C)
    const tmax =
      32.5 +
      6.5 * Math.sin(((doy - 55) / 365) * 2 * Math.PI) -
      (doy >= 180 && doy <= 255 ? 3.5 : 0);

    const rainMean = Number((baseRain * annualScale).toFixed(2));
    days.push({
      doy,
      rain_mm_mean: rainMean,
      et0_mm_mean: Number(Math.max(2.8, et0).toFixed(2)),
      tmax_c_mean: Number(tmax.toFixed(1)),
      rain_mm_dry_p20: Number((rainMean * 0.62).toFixed(2)),
      rain_mm_wet_p80: Number((rainMean * 1.42).toFixed(2)),
    });
  }

  return {
    location_id: locationId,
    climatology_version: `${CLIMATOLOGY_VERSION}-fallback`,
    source: "Prototype Maharashtra regional climatology fallback (unvalidated sample)",
    period: "Prototype fallback",
    p20_p80_method: "Proportional dry/wet scaling (fallback only)",
    is_fallback_sample: true,
    days,
  };
}

const cache = new Map<string, ClimatologyFile>();

export function getClimatology(locationId: string): ClimatologyFile {
  const existing = cache.get(locationId);
  if (existing) return existing;

  const filePath = path.join(process.cwd(), "data", "climatology", `${locationId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as ClimatologyFile;
      cache.set(locationId, parsed);
      return parsed;
    } catch {
      // fall through to fallback
    }
  }

  const fb = buildFallbackClimatology(locationId);
  cache.set(locationId, fb);
  return fb;
}
