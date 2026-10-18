import { describe, expect, test } from "vitest";
import { dayLengthsByDate, type Location, readYear, solsticesAndEquinoxes } from "./index.ts";

// Reference instants come from the USNO "Earth's Seasons" service (aa.usno.navy.mil/api/seasons),
// in UTC and rounded to the minute. Meeus's method is good to about a minute over this range.
const SOLSTICE_AND_EQUINOX_TOLERANCE_MS = 5 * 60_000;
// Day lengths come from USNO Sunrise and Sunset times, each rounded to the minute.
const DAY_LENGTH_TOLERANCE_MS = 2 * 60_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

const PARIS: Location = { latitude: 48.8566, longitude: 2.3522 };
const QUITO: Location = { latitude: -0.1807, longitude: -78.4678 };
const SYDNEY: Location = { latitude: -33.8688, longitude: 151.2093 };
const TROMSØ: Location = { latitude: 69.6492, longitude: 18.9553 };
const LONGYEARBYEN: Location = { latitude: 78.2232, longitude: 15.6267 };

/** The index of a date of 2026 in its year, from 0 for 1 January. */
function dateIndex(month: number, day: number): number {
  return (Date.UTC(2026, month - 1, day) - Date.UTC(2026, 0, 1)) / (24 * HOUR);
}

const USNO_SEASONS: Readonly<Record<number, readonly [string, string, string, string]>> = {
  2024: ["2024-03-20T03:06Z", "2024-06-20T20:51Z", "2024-09-22T12:44Z", "2024-12-21T09:20Z"],
  2025: ["2025-03-20T09:01Z", "2025-06-21T02:42Z", "2025-09-22T18:19Z", "2025-12-21T15:03Z"],
  2026: ["2026-03-20T14:46Z", "2026-06-21T08:24Z", "2026-09-23T00:05Z", "2026-12-21T20:50Z"],
  2027: ["2027-03-20T20:25Z", "2027-06-21T14:11Z", "2027-09-23T06:02Z", "2027-12-22T02:42Z"],
  2028: ["2028-03-20T02:17Z", "2028-06-20T20:02Z", "2028-09-22T11:45Z", "2028-12-21T08:19Z"],
  2029: ["2029-03-20T08:02Z", "2029-06-21T01:48Z", "2029-09-22T17:38Z", "2029-12-21T14:14Z"],
  2030: ["2030-03-20T13:52Z", "2030-06-21T07:31Z", "2030-09-22T23:27Z", "2030-12-21T20:09Z"],
};

describe("solsticesAndEquinoxes", () => {
  test.each(Object.entries(USNO_SEASONS))("matches USNO in %s", (year, expected) => {
    const events = solsticesAndEquinoxes(Number(year));

    expect(events.map(({ kind, month }) => `${kind} ${month}`)).toEqual([
      "equinox 3",
      "solstice 6",
      "equinox 9",
      "solstice 12",
    ]);
    events.forEach(({ instant }, index) => {
      const difference = Math.abs(instant.getTime() - Date.parse(expected[index] ?? ""));
      expect(difference, `${instant.toISOString()} vs ${expected[index]}`).toBeLessThanOrEqual(
        SOLSTICE_AND_EQUINOX_TOLERANCE_MS,
      );
    });
  });
});

describe("dayLengthsByDate", () => {
  test("gives one Day length per civil date of the year", () => {
    expect(dayLengthsByDate(PARIS, 2026, "Europe/Paris")).toHaveLength(365);
    expect(dayLengthsByDate(PARIS, 2028, "Europe/Paris")).toHaveLength(366);
  });

  // USNO, in local time: Paris 21 June 05:47 → 21:58 and 21 December 08:41 → 16:56; Quito
  // 20 March 06:18 → 18:24 and 21 June 06:12 → 18:19; Sydney 21 June 07:00 → 16:54 and
  // 21 December 05:41 → 20:05.
  test.each([
    {
      place: "Paris",
      location: PARIS,
      timeZone: "Europe/Paris",
      month: 6,
      day: 21,
      length: [16, 11],
    },
    {
      place: "Paris",
      location: PARIS,
      timeZone: "Europe/Paris",
      month: 12,
      day: 21,
      length: [8, 15],
    },
    {
      place: "Quito",
      location: QUITO,
      timeZone: "America/Guayaquil",
      month: 3,
      day: 20,
      length: [12, 6],
    },
    {
      place: "Quito",
      location: QUITO,
      timeZone: "America/Guayaquil",
      month: 6,
      day: 21,
      length: [12, 7],
    },
    {
      place: "Sydney",
      location: SYDNEY,
      timeZone: "Australia/Sydney",
      month: 6,
      day: 21,
      length: [9, 54],
    },
    {
      place: "Sydney",
      location: SYDNEY,
      timeZone: "Australia/Sydney",
      month: 12,
      day: 21,
      length: [14, 24],
    },
  ])("matches USNO in $place on $day/$month", ({ location, timeZone, month, day, length }) => {
    const [hours = 0, minutes = 0] = length;
    const actual = dayLengthsByDate(location, 2026, timeZone)[dateIndex(month, day)] ?? 0;

    expect(Math.abs(actual - (hours * HOUR + minutes * MINUTE))).toBeLessThanOrEqual(
      DAY_LENGTH_TOLERANCE_MS,
    );
  });

  test("counts a date of Polar day as 24 hours, and a date of Polar night as none", () => {
    for (const [location, timeZone] of [
      [TROMSØ, "Europe/Oslo"],
      [LONGYEARBYEN, "Arctic/Longyearbyen"],
    ] as const) {
      const lengths = dayLengthsByDate(location, 2026, timeZone);

      expect(lengths[dateIndex(6, 21)]).toBe(24 * HOUR);
      expect(lengths[dateIndex(12, 21)]).toBe(0);
    }
  });

  test("counts only the parts of Days that fall within the date", () => {
    // USNO, Tromsø on 18 May: the Sun sets at 00:27 local time and rises at 00:53 into the
    // Polar day, so it is up for all but 26 minutes of the date. Each Solar event is held to
    // the clock's high-latitude tolerance of 3 minutes.
    const length = dayLengthsByDate(TROMSØ, 2026, "Europe/Oslo")[dateIndex(5, 18)] ?? 0;

    expect(Math.abs(length - (23 * HOUR + 34 * MINUTE))).toBeLessThanOrEqual(6 * MINUTE);
  });
});

describe("readYear", () => {
  test("reads the civil year of the instant, with the Solstices and Equinoxes to come", () => {
    // 23:30 UTC on 31 December is already 1 January in Paris.
    const reading = readYear(PARIS, new Date("2026-12-31T23:30:00Z"), "Europe/Paris");

    expect(reading.year).toBe(2027);
    expect(reading.dayLengths).toEqual(dayLengthsByDate(PARIS, 2027, "Europe/Paris"));
    expect(reading.solsticesAndEquinoxes).toEqual([
      ...solsticesAndEquinoxes(2027),
      ...solsticesAndEquinoxes(2028),
    ]);
    expect(reading.instant).toEqual(new Date("2026-12-31T23:30:00Z"));
  });
});
