import { describe, expect, test } from "vitest";
import { type ClockSnapshot, type Location, readClock } from "./index.ts";

// Reference Sunrise and Sunset times come from the USNO "Rise/Set/Transit Times" service
// (aa.usno.navy.mil/api/rstt), which uses the same −0.833° convention. They are UTC and
// rounded to the minute.
const TOLERANCE_MS = 60_000;

const PARIS: Location = { latitude: 48.8566, longitude: 2.3522 };
const QUITO: Location = { latitude: -0.1807, longitude: -78.4678 };
const SYDNEY: Location = { latitude: -33.8688, longitude: 151.2093 };

function expectNear(actual: Date, expected: string): void {
  const difference = Math.abs(actual.getTime() - Date.parse(expected));
  expect(difference, `${actual.toISOString()} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE_MS);
}

function expectDurationNear(actual: number, hours: number, minutes: number): void {
  const difference = Math.abs(actual - (hours * 60 + minutes) * 60_000);
  expect(difference, `${actual} ms vs ${hours} h ${minutes}`).toBeLessThanOrEqual(TOLERANCE_MS);
}

function expectPhase(
  snapshot: ClockSnapshot,
  kind: ClockSnapshot["phase"]["kind"],
  start: string,
  end: string,
): void {
  expect(snapshot.phase.kind).toBe(kind);
  expectNear(snapshot.phase.start, start);
  expectNear(snapshot.phase.end, end);
}

describe("readClock", () => {
  test("an ordinary Day in Paris runs from Sunrise to Sunset", () => {
    const snapshot = readClock(PARIS, new Date("2026-06-21T12:00:00Z"));

    expectPhase(snapshot, "day", "2026-06-21T03:47Z", "2026-06-21T19:58Z");
  });

  test("Remaining time, Elapsed time and Progress are measured within the Phase", () => {
    const snapshot = readClock(PARIS, new Date("2026-06-21T12:00:00Z"));

    // 03:47 → 12:00 → 19:58: 8 h 13 elapsed, 7 h 58 remaining, of a 16 h 11 Day.
    expectDurationNear(snapshot.elapsed, 8, 13);
    expectDurationNear(snapshot.remaining, 7, 58);
    expect(snapshot.progress).toBeCloseTo(493 / 971, 2);
  });

  test.each([
    {
      case: "an evening Night in Paris",
      location: PARIS,
      instant: "2026-06-21T20:30:00Z", // 22:30 in Paris
      kind: "night",
      start: "2026-06-21T19:58Z",
      end: "2026-06-22T03:47Z",
    },
    {
      case: "a Night in Paris spanning civil midnight",
      location: PARIS,
      instant: "2026-06-21T23:00:00Z", // 01:00 in Paris
      kind: "night",
      start: "2026-06-21T19:58Z",
      end: "2026-06-22T03:47Z",
    },
    {
      case: "a Day in Quito",
      location: QUITO,
      instant: "2026-03-20T17:00:00Z",
      kind: "day",
      start: "2026-03-20T11:18Z",
      end: "2026-03-20T23:24Z",
    },
    {
      case: "a Night in Quito",
      location: QUITO,
      instant: "2026-03-21T03:00:00Z",
      kind: "night",
      start: "2026-03-20T23:24Z",
      end: "2026-03-21T11:18Z",
    },
    {
      case: "a Day in Sydney",
      location: SYDNEY,
      instant: "2026-01-15T02:00:00Z", // 13:00 in Sydney
      kind: "day",
      start: "2026-01-14T18:59Z",
      end: "2026-01-15T09:09Z",
    },
    {
      case: "a Night in Sydney",
      location: SYDNEY,
      instant: "2026-01-15T12:00:00Z",
      kind: "night",
      start: "2026-01-15T09:09Z",
      end: "2026-01-15T19:00Z",
    },
  ] as const)("$case matches the reference", ({ location, instant, kind, start, end }) => {
    expectPhase(readClock(location, new Date(instant)), kind, start, end);
  });

  test("a daylight-saving change during a Night does not distort Remaining time", () => {
    // Paris switches from CET to CEST at 01:00 UTC on 29 March 2026. At midnight CET, Sunrise
    // (05:35 UTC) is at 07:35 CEST in Civil time, but only 6 h 35 away.
    const snapshot = readClock(PARIS, new Date("2026-03-28T23:00:00Z"));

    expectPhase(snapshot, "night", "2026-03-28T18:15Z", "2026-03-29T05:35Z");
    expectDurationNear(snapshot.remaining, 6, 35);
  });

  test("exactly at a Solar event, the next Phase has just begun", () => {
    const day = readClock(PARIS, new Date("2026-06-21T12:00:00Z"));
    const sunset = day.phase.end;

    const justBefore = readClock(PARIS, new Date(sunset.getTime() - 1));
    expect(justBefore.phase.kind).toBe("day");
    expect(justBefore.remaining).toBe(1);

    const atSunset = readClock(PARIS, sunset);
    expect(atSunset.phase.kind).toBe("night");
    expect(atSunset.phase.start).toEqual(sunset);
    expect(atSunset.elapsed).toBe(0);
    expect(atSunset.progress).toBe(0);
  });
});
