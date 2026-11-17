import locationsJson from "../../data/locations.json";
import cropsJson from "../../data/crops.json";
import groundwaterJson from "../../data/groundwater.json";
import configJson from "../../data/config.json";
import type {
  CropRecord,
  EngineConfig,
  GroundwaterRecord,
  LocationRecord,
} from "../types";

export const LOCATIONS = locationsJson as LocationRecord[];
export const CROPS = cropsJson as CropRecord[];
export const GROUNDWATER_RECORDS = groundwaterJson as GroundwaterRecord[];
export const ENGINE_CONFIG = configJson as EngineConfig;

export function getLocationById(id: string): LocationRecord | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

export function getGroundwaterForLocation(locationId: string): GroundwaterRecord {
  const found = GROUNDWATER_RECORDS.find((g) => g.location_id === locationId);
  if (found) return found;
  return {
    location_id: locationId,
    assessment_unit: "Unknown",
    district: "Unknown",
    category: "UNKNOWN",
    stage_of_extraction_pct: null,
    geographic_level: "UNAVAILABLE",
    report_title: "No verified GSDA/CGWB record available",
    assessment_year: "N/A",
    published_date: "N/A",
    agency: "GSDA / CGWB",
    page_or_table: "N/A",
    retrieved_on: "N/A",
    verification_status: "UNVALIDATED_PROTOTYPE_ASSUMPTION",
    missing_reason: "Location not found in verified GSDA GWRE 2022-23 baseline dataset",
  };
}
