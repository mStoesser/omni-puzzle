// Calendar days as "YYYY-MM-DD" (M26). The current day comes from the server (Europe/Berlin), never from the
// device clock, so all players share the same day; this module only checks and counts days.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A valid calendar day like "2026-11-07". */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** The day `delta` days later (earlier if negative). */
export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}
