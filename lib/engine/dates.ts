export function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseIsoDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function diffDays(startStr: string, endStr: string): number {
  const s = parseIsoDate(startStr).getTime();
  const e = parseIsoDate(endStr).getTime();
  return Math.round((e - s) / 86400000);
}

export function dayOfYear(dateStr: string): number {
  const d = parseIsoDate(dateStr);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86400000) + 1;
  return Math.min(365, Math.max(1, doy));
}

export function daysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function mmddToDoy(mmdd: string, year: number): number {
  return dayOfYear(`${year}-${mmdd}`);
}

export function isWithinSowingWindow(
  sowingDate: string,
  startMmdd: string,
  endMmdd: string
): { inWindow: boolean; daysOutside: number } {
  const year = Number(sowingDate.slice(0, 4));
  const sowDoy = dayOfYear(sowingDate);
  const startDoy = mmddToDoy(startMmdd, year);
  const endDoy = mmddToDoy(endMmdd, year);

  if (startDoy <= endDoy) {
    if (sowDoy >= startDoy && sowDoy <= endDoy) return { inWindow: true, daysOutside: 0 };
    const dist = Math.min(Math.abs(sowDoy - startDoy), Math.abs(sowDoy - endDoy));
    return { inWindow: false, daysOutside: dist };
  }
  // Wrap-around year boundary
  if (sowDoy >= startDoy || sowDoy <= endDoy) return { inWindow: true, daysOutside: 0 };
  const dist = Math.min(Math.abs(sowDoy - startDoy), Math.abs(sowDoy - endDoy));
  return { inWindow: false, daysOutside: dist };
}
