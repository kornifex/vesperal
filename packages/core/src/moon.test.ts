import { describe, expect, test } from "vitest";
import { moonPhase } from "./index.ts";

// Illuminated fractions from JPL Horizons (quantity 10, geocentric), at 00:00 UTC, with
// whether the Moon is waxing then, from the USNO phases: Full Moon on 3 January 2026 at 10:03,
// New Moon on 18 January at 19:52, Full Moon on 1 February at 22:09. Dates within a day of a New
// or Full Moon leave out whether it is waxing, which the primary phases below pin down.
const HORIZONS: readonly { date: string; percent: number; waxing?: boolean }[] = [
  { date: "2026-01-01", percent: 91.39877, waxing: true },
  { date: "2026-01-05", percent: 96.47002, waxing: false },
  { date: "2026-01-09", percent: 66.20174, waxing: false },
  { date: "2026-01-13", percent: 28.59788, waxing: false },
  { date: "2026-01-17", percent: 3.39145, waxing: false },
  { date: "2026-01-19", percent: 0.10942 },
  { date: "2026-01-21", percent: 4.86036, waxing: true },
  { date: "2026-01-25", percent: 36.82751, waxing: true },
  { date: "2026-01-29", percent: 80.21626, waxing: true },
  { date: "2026-02-02", percent: 99.95555 },
  { date: "2029-07-06", percent: 29.32775, waxing: false },
  { date: "2029-07-16", percent: 21.95769, waxing: true },
  { date: "2029-07-21", percent: 76.39343, waxing: true },
  { date: "2029-07-31", percent: 72.72241, waxing: false },
];
// Meeus's short series stays within 0.003 of Horizons over these dates; 0.005 leaves room.
const FRACTION_TOLERANCE = 0.005;

describe("moonPhase", () => {
  test.each(HORIZONS)("matches JPL Horizons on $date", ({ date, percent, waxing }) => {
    const actual = moonPhase(new Date(`${date}T00:00:00Z`));

    expect(Math.abs(actual.illuminated - percent / 100)).toBeLessThanOrEqual(FRACTION_TOLERANCE);
    if (waxing !== undefined) expect(actual.waxing).toBe(waxing);
  });
});

// USNO primary phases, in UTC.
const USNO_PRIMARY_PHASES: readonly { primary: string; instant: string }[] = [
  { primary: "Full Moon", instant: "2026-01-03T10:03Z" },
  { primary: "Last Quarter", instant: "2026-01-10T15:48Z" },
  { primary: "New Moon", instant: "2026-01-18T19:52Z" },
  { primary: "First Quarter", instant: "2026-01-26T04:47Z" },
  { primary: "Full Moon", instant: "2026-02-01T22:09Z" },
  { primary: "Last Quarter", instant: "2026-02-09T12:43Z" },
  { primary: "New Moon", instant: "2026-02-17T12:01Z" },
  { primary: "First Quarter", instant: "2026-02-24T12:27Z" },
  { primary: "Full Moon", instant: "2026-03-03T11:38Z" },
  { primary: "New Moon", instant: "2026-03-19T01:23Z" },
  { primary: "First Quarter", instant: "2026-03-25T19:18Z" },
  { primary: "Last Quarter", instant: "2026-04-10T04:51Z" },
  { primary: "Last Quarter", instant: "2029-07-03T17:57Z" },
  { primary: "New Moon", instant: "2029-07-11T15:51Z" },
  { primary: "First Quarter", instant: "2029-07-18T14:14Z" },
  { primary: "Full Moon", instant: "2029-07-25T13:36Z" },
];
// Near a quarter the lit part grows or shrinks by about 0.106 a day: 0.0088 is 2 hours.
const QUARTER_TOLERANCE = 0.0088;
const TWO_HOURS = 2 * 3_600_000;

describe("moonPhase at the USNO primary phases", () => {
  test.each(USNO_PRIMARY_PHASES.filter(({ primary }) => primary.endsWith("Quarter")))(
    "is half lit at the $primary of $instant",
    ({ primary, instant }) => {
      const { illuminated, waxing } = moonPhase(new Date(instant));

      expect(Math.abs(illuminated - 0.5)).toBeLessThanOrEqual(QUARTER_TOLERANCE);
      expect(waxing).toBe(primary === "First Quarter");
    },
  );

  test.each(USNO_PRIMARY_PHASES.filter(({ primary }) => primary.endsWith("Moon")))(
    "turns from waning to waxing or back within 2 hours of the $primary of $instant",
    ({ primary, instant }) => {
      const at = Date.parse(instant);
      const before = moonPhase(new Date(at - TWO_HOURS));
      const after = moonPhase(new Date(at + TWO_HOURS));

      expect(before.waxing).toBe(primary === "Full Moon");
      expect(after.waxing).toBe(primary === "New Moon");
    },
  );
});
