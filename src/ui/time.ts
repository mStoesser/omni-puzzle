// Short relative times for cards ("vor 2 Std.", "gestern"). Pure, so it is tested without a DOM.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto", style: "short" });
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
// Calendar days ("2026-11-07") are formatted in UTC, so the device's time zone cannot shift them.
const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

/** A calendar day like "2026-11-07" as "Sa., 7.11."; the input as is if it is no day. */
export function formatDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(time) ? day : weekday.format(time);
}

/** `iso` relative to `now`; older than a week as a date. Empty for invalid input. */
export function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  if (diff < HOUR) return relative.format(-Math.max(1, Math.round(diff / MINUTE)), "minute");
  if (diff < DAY) return relative.format(-Math.round(diff / HOUR), "hour");
  if (diff < 7 * DAY) return relative.format(-Math.round(diff / DAY), "day");
  return date.format(then);
}
