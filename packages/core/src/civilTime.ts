// Civil dates in a time zone, with nothing but Intl.
import { MINUTES_PER_HOUR, MS_PER_DAY, MS_PER_MINUTE } from "./time.ts";

/** The civil date of `instant` in `timeZone`, as a count of days since 1 January 1970. */
export function civilDayNumber(instant: Date, timeZone: string): number {
  const { year, month, day } = wallClock(instant.getTime(), timeZone);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * The instant, in milliseconds since the epoch, at which a civil date begins in `timeZone`.
 * The date is a count of days since 1 January 1970.
 */
export function startOfCivilDay(dayNumber: number, timeZone: string): number {
  const midnightAsUtc = dayNumber * MS_PER_DAY;
  // The offset from UTC at midnight is found from a first guess at it, in two steps, so that a
  // daylight-saving change on either side of midnight is accounted for.
  let start = midnightAsUtc - offsetFromUtc(midnightAsUtc, timeZone);
  start = midnightAsUtc - offsetFromUtc(start, timeZone);
  if (civilDayNumber(new Date(start), timeZone) === dayNumber) return start;

  // Where clocks spring forward at midnight, as in Santiago or Havana, midnight never comes:
  // `start` is then the hour before, and the date begins when the clocks jump.
  let before = start;
  let after = start + 3 * MINUTES_PER_HOUR * MS_PER_MINUTE;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (civilDayNumber(new Date(middle), timeZone) === dayNumber) after = middle;
    else before = middle;
  }
  return after;
}

/** How far ahead of UTC the clocks of `timeZone` are at `epochMs`, in milliseconds. */
function offsetFromUtc(epochMs: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = wallClock(epochMs, timeZone);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return wallClockAsUtc - (epochMs - (((epochMs % 1000) + 1000) % 1000));
}

function wallClock(
  epochMs: number,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}
