import { APP_MESSAGES } from "../constants/app-messages.js";
import { BadRequestException } from "../exceptions/bad-request-exception.js";

export const RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "last90", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** `start` inclusive, `end` exclusive (both UTC instants); `startDate`/`endDate` are inclusive local calendar days. */
export type DateRange = { start: Date; end: Date; startDate: string; endDate: string; timezone: string; preset: RangePreset };

export type RangeInput = { preset: RangePreset; from: string | null; to: string | null; timezone: string; now?: Date };

const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

export function isValidTimeZone(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return true; } catch { return false; }
}

function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function offsetMs(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

/** The UTC instant at which `date` begins in `timezone` (handles DST by re-evaluating the offset). */
export function startOfLocalDay(date: string, timezone: string): Date {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - offsetMs(guess, timezone);
  return new Date(guess - offsetMs(first, timezone));
}

export function resolveDateRange(input: RangeInput): DateRange {
  const { preset, from, to, timezone } = input;
  if (!isValidTimeZone(timezone)) throw new BadRequestException(APP_MESSAGES.INVALID_TIMEZONE);
  const today = localDate(input.now ?? new Date(), timezone);

  let startDate: string;
  let endDate: string;
  switch (preset) {
    case "today": startDate = today; endDate = today; break;
    case "yesterday": startDate = addDays(today, -1); endDate = startDate; break;
    case "last7": startDate = addDays(today, -6); endDate = today; break;
    case "last30": startDate = addDays(today, -29); endDate = today; break;
    case "last90": startDate = addDays(today, -89); endDate = today; break;
    case "custom":
      if (!from || !to || from > to) throw new BadRequestException(APP_MESSAGES.INVALID_DATE_RANGE);
      startDate = from; endDate = to; break;
  }
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_DAYS) throw new BadRequestException(APP_MESSAGES.RANGE_TOO_LARGE);

  return { start: startOfLocalDay(startDate, timezone), end: startOfLocalDay(addDays(endDate, 1), timezone), startDate, endDate, timezone, preset };
}
