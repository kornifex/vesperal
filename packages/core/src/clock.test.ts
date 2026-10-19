import { describe, expect, test } from "vitest";
import { type ClockSnapshot, type Location, readClock } from "./index.ts";

// Reference Sunrise and Sunset times come from the USNO "Rise/Set/Transit Times" service
// (aa.usno.navy.mil/api/rstt), which uses the same −0.833° convention. They are UTC and
// rounded to the minute.
const TOLERANCE_MS = 60_000;
// Above the polar circles, and wherever the Sun only grazes the horizon, it crosses the
// horizon at a shallow angle: a hundredth of a degree of difference between solar models
// moves a Solar event by minutes. NOAA's algorithm is therefore only held to ±3 minutes there.
const HIGH_LATITUDE_TOLERANCE_MS = 3 * 60_000;

const PARIS: Location = { latitude: 48.8566, longitude: 2.3522 };
const QUITO: Location = { latitude: -0.1807, longitude: -78.4678 };
const SYDNEY: Location = { latitude: -33.8688, longitude: 151.2093 };
const TROMSØ: Location = { latitude: 69.6492, longitude: 18.9553 };
const LONGYEARBYEN: Location = { latitude: 78.2232, longitude: 15.6267 };
const MCMURDO: Location = { latitude: -77.846, longitude: 166.676 };
// Apia, Samoa: just west of the date line, at UTC+13.
const APIA: Location = { latitude: -13.8333, longitude: -171.7667 };
// A point just south of the polar circle where, around the winter solstice, the Sun only
// shows for about ten minutes a day.
const GRAZING: Location = { latitude: 67.393, longitude: 13.25 };

function expectNear(actual: Date, expected: string, tolerance = TOLERANCE_MS): void {
  const difference = Math.abs(actual.getTime() - Date.parse(expected));
  expect(difference, `${actual.toISOString()} vs ${expected}`).toBeLessThanOrEqual(tolerance);
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
  tolerance = TOLERANCE_MS,
): void {
  expect(snapshot.phase.kind).toBe(kind);
  expectNear(snapshot.phase.start, start, tolerance);
  expectNear(snapshot.phase.end, end, tolerance);
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

  // Each end of a Day length is within the tolerance, so the length is within twice that.
  test("during a Day, the Day length is the length of the current Day", () => {
    const snapshot = readClock(PARIS, new Date("2026-06-21T12:00:00Z"));

    // 03:47 → 19:58
    expect(Math.abs(snapshot.lastDayLength - (16 * 60 + 11) * 60_000)).toBeLessThanOrEqual(
      2 * TOLERANCE_MS,
    );
  });

  test("during a Night, the Day length is the length of the Day that just ended", () => {
    const snapshot = readClock(SYDNEY, new Date("2026-01-15T12:00:00Z"));

    // 14 January 18:59 → 15 January 09:09
    expect(Math.abs(snapshot.lastDayLength - (14 * 60 + 10) * 60_000)).toBeLessThanOrEqual(
      2 * TOLERANCE_MS,
    );
  });

  // Paris around the equinoxes, when Day length changes fastest, and the solstices, when it
  // barely changes. USNO: 19 March 05:56 → 18:02; 20 June 03:47 → 19:58; 22 September
  // 05:37 → 17:49; 20 December 07:41 → 15:56.
  test.each([
    { instant: "2026-03-20T12:00:00Z", hours: 12, minutes: 6 },
    { instant: "2026-06-21T12:00:00Z", hours: 16, minutes: 11 },
    { instant: "2026-09-23T12:00:00Z", hours: 12, minutes: 12 },
    { instant: "2026-12-21T12:00:00Z", hours: 8, minutes: 15 },
  ])("during the Day of $instant, gives the length of the Day before", (reference) => {
    const { previousDayLength } = readClock(PARIS, new Date(reference.instant));

    const expected = (reference.hours * 60 + reference.minutes) * 60_000;
    expect(previousDayLength).not.toBeNull();
    expect(Math.abs((previousDayLength ?? 0) - expected)).toBeLessThanOrEqual(2 * TOLERANCE_MS);
  });

  // Near a solstice the Day length changes by seconds, well within the reference tolerance:
  // only the clock's own reading of the day before can tell that Day from the current one.
  test("gives exactly the Day length the clock read the day before", () => {
    const yesterday = readClock(PARIS, new Date("2026-06-20T12:00:00Z"));
    const today = readClock(PARIS, new Date("2026-06-21T12:00:00Z"));

    expect(today.previousDayLength).toBe(yesterday.lastDayLength);
    expect(today.lastDayLength).not.toBe(yesterday.lastDayLength);
  });

  test("during a Night, gives the length of the Day before the one that just ended", () => {
    const { previousDayLength } = readClock(PARIS, new Date("2026-03-20T22:00:00Z"));

    // USNO: 19 March 05:56 → 18:02
    const expected = (12 * 60 + 6) * 60_000;
    expect(previousDayLength).not.toBeNull();
    expect(Math.abs((previousDayLength ?? 0) - expected)).toBeLessThanOrEqual(2 * TOLERANCE_MS);
  });

  test("gives no Day before the first Day after a Polar night, nor during a Polar day", () => {
    // Tromsø: the Polar night ends on 15 January at 10:35, and a Polar day runs from 17 May.
    expect(readClock(TROMSØ, new Date("2027-01-15T10:50:00Z")).previousDayLength).toBeNull();
    expect(readClock(TROMSØ, new Date("2026-06-21T12:00:00Z")).previousDayLength).toBeNull();
  });

  test("gives the Moon phase at the instant read", () => {
    const instant = new Date("2026-01-26T04:47:00Z");

    // USNO: First Quarter.
    const { moon } = readClock(PARIS, instant);
    expect(moon.illuminated).toBeCloseTo(0.5, 2);
    expect(moon.waxing).toBe(true);
  });

  test("records the instant it was read at", () => {
    const instant = new Date("2026-06-21T12:00:00Z");

    expect(readClock(PARIS, instant).instant).toEqual(instant);
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

describe("readClock at high latitudes and near the date line", () => {
  test.each([
    {
      case: "Tromsø, a Day with two Sunrises on the same UTC date",
      location: TROMSØ,
      instant: "2026-05-13T12:00:00Z",
      kind: "day",
      start: "2026-05-13T00:02Z",
      end: "2026-05-13T21:27Z",
    },
    {
      case: "Tromsø, the 26-minute Night before the Polar day",
      location: TROMSØ,
      instant: "2026-05-17T22:40:00Z",
      kind: "night",
      start: "2026-05-17T22:27Z",
      end: "2026-05-17T22:53Z",
    },
    {
      case: "Tromsø, the first day of the Polar day",
      location: TROMSØ,
      instant: "2026-05-18T12:00:00Z",
      kind: "day",
      start: "2026-05-17T22:53Z",
      end: "2026-07-25T22:36Z",
    },
    {
      case: "Tromsø, the last day of the Polar day",
      location: TROMSØ,
      instant: "2026-07-25T12:00:00Z",
      kind: "day",
      start: "2026-05-17T22:53Z",
      end: "2026-07-25T22:36Z",
    },
    {
      case: "Tromsø, the first Night after the Polar day",
      location: TROMSØ,
      instant: "2026-07-25T22:50:00Z",
      kind: "night",
      start: "2026-07-25T22:36Z",
      end: "2026-07-25T23:06Z",
    },
    {
      case: "Tromsø, the 22-minute Day before the Polar night",
      location: TROMSØ,
      instant: "2026-11-27T10:30:00Z",
      kind: "day",
      start: "2026-11-27T10:20Z",
      end: "2026-11-27T10:42Z",
    },
    {
      case: "Tromsø, the first day of the Polar night",
      location: TROMSØ,
      instant: "2026-11-28T12:00:00Z",
      kind: "night",
      start: "2026-11-27T10:42Z",
      end: "2027-01-15T10:35Z",
    },
    {
      case: "Tromsø, the last day of the Polar night",
      location: TROMSØ,
      instant: "2027-01-15T06:00:00Z",
      kind: "night",
      start: "2026-11-27T10:42Z",
      end: "2027-01-15T10:35Z",
    },
    {
      case: "Longyearbyen, the Polar day",
      location: LONGYEARBYEN,
      instant: "2026-04-18T12:00:00Z",
      kind: "day",
      start: "2026-04-17T23:39Z",
      end: "2026-08-24T22:29Z",
    },
    {
      case: "Longyearbyen, the first Night after the Polar day",
      location: LONGYEARBYEN,
      instant: "2026-08-24T23:00:00Z",
      kind: "night",
      start: "2026-08-24T22:29Z",
      end: "2026-08-24T23:33Z",
    },
    {
      case: "McMurdo, the last Day before the Polar night",
      location: MCMURDO,
      instant: "2026-04-24T01:00:00Z",
      kind: "day",
      start: "2026-04-24T00:11Z",
      end: "2026-04-24T01:30Z",
    },
    {
      case: "McMurdo, the Polar night",
      location: MCMURDO,
      instant: "2026-06-21T12:00:00Z",
      kind: "night",
      start: "2026-04-24T01:30Z",
      end: "2026-08-19T00:20Z",
    },
    {
      case: "McMurdo, the first Day after the Polar night",
      location: MCMURDO,
      instant: "2026-08-19T01:00:00Z",
      kind: "day",
      start: "2026-08-19T00:20Z",
      end: "2026-08-19T01:36Z",
    },
    {
      case: "Apia, a Day across the UTC date change",
      location: APIA,
      instant: "2026-06-21T00:00:00Z",
      kind: "day",
      start: "2026-06-20T17:50Z",
      end: "2026-06-21T05:08Z",
    },
    {
      case: "Apia, a Night",
      location: APIA,
      instant: "2026-06-21T10:00:00Z",
      kind: "night",
      start: "2026-06-21T05:08Z",
      end: "2026-06-21T17:50Z",
    },
    {
      case: "a Night before a Day of about ten minutes",
      location: GRAZING,
      instant: "2026-12-21T09:00:00Z",
      kind: "night",
      start: "2026-12-20T11:13Z",
      end: "2026-12-21T11:00Z",
    },
    {
      case: "a Day of about ten minutes",
      location: GRAZING,
      instant: "2026-12-21T11:05:00Z",
      kind: "day",
      start: "2026-12-21T11:00Z",
      end: "2026-12-21T11:10Z",
    },
  ] as const)("$case matches the reference", ({ location, instant, kind, start, end }) => {
    expectPhase(
      readClock(location, new Date(instant)),
      kind,
      start,
      end,
      HIGH_LATITUDE_TOLERANCE_MS,
    );
  });

  test("flags a Phase longer than 24 hours as a Polar day or Polar night", () => {
    expect(readClock(TROMSØ, new Date("2026-05-18T12:00:00Z")).longPhase).toBe("polar-day");
    expect(readClock(TROMSØ, new Date("2026-11-28T12:00:00Z")).longPhase).toBe("polar-night");
    expect(readClock(TROMSØ, new Date("2026-05-13T12:00:00Z")).longPhase).toBeNull();
    expect(readClock(PARIS, new Date("2026-06-21T12:00:00Z")).longPhase).toBeNull();
  });

  test("reaches a Solar event half a year away, at the poles", () => {
    const southPole: Location = { latitude: -90, longitude: 0 };
    const snapshot = readClock(southPole, new Date("2026-06-21T12:00:00Z"));

    // The Sun set around the March equinox and rises around the September one.
    expect(snapshot.phase.kind).toBe("night");
    expect(snapshot.phase.start.getTime()).toBeLessThan(Date.parse("2026-04-01T00:00Z"));
    expect(snapshot.phase.end.getTime()).toBeGreaterThan(Date.parse("2026-09-10T00:00Z"));
  });
});

// Reference Dawn and Dusk times: civil ones from USNO, as above; nautical and astronomical ones
// from sunrise-sunset.org (api.sunrise-sunset.org), which agrees with USNO on civil ones to the
// second. Twilight altitudes are geometric (−6°, −12°, −18°), with no refraction.
describe("readClock: Dawn and Dusk", () => {
  test("during a Day, gives the Dawn before its Sunrise and the Dusk after its Sunset", () => {
    const snapshot = readClock(PARIS, new Date("2026-06-21T12:00:00Z"), "civil");

    expectNear(snapshot.dawn ?? new Date(Number.NaN), "2026-06-21T03:04Z");
    expectNear(snapshot.dusk ?? new Date(Number.NaN), "2026-06-21T20:41Z");
  });

  test("during a Night, gives the Dusk after its Sunset and the Dawn before its Sunrise", () => {
    const snapshot = readClock(PARIS, new Date("2026-12-21T20:00:00Z"), "nautical");

    expectNear(snapshot.dusk ?? new Date(Number.NaN), "2026-12-21T17:13:44Z");
    expectNear(snapshot.dawn ?? new Date(Number.NaN), "2026-12-22T06:24:03Z");
  });

  test("follows the chosen Twilight", () => {
    const at = new Date("2026-12-21T12:00:00Z");

    expectNear(readClock(PARIS, at, "civil").dawn ?? new Date(Number.NaN), "2026-12-21T07:04Z");
    expectNear(
      readClock(PARIS, at, "astronomical").dusk ?? new Date(Number.NaN),
      "2026-12-21T17:52:15Z",
    );
  });

  test("defaults to the civil Twilight", () => {
    const at = new Date("2026-12-21T12:00:00Z");

    expect(readClock(PARIS, at).dawn).toEqual(readClock(PARIS, at, "civil").dawn);
  });

  test("has no Dawn or Dusk when the Sun never gets that far below the horizon", () => {
    // Around the June solstice, the Sun stays above −18° all night in Paris.
    const day = readClock(PARIS, new Date("2026-06-21T12:00:00Z"), "astronomical");
    const night = readClock(PARIS, new Date("2026-06-21T23:00:00Z"), "astronomical");

    expect([day.dawn, day.dusk, night.dusk, night.dawn]).toEqual([null, null, null, null]);
  });
});

// Reference Dawn and Dusk times from sunrise-sunset.org, as above.
describe("readClock: from Dawn to Dusk", () => {
  test("defaults to counting from Sunrise to Sunset", () => {
    const at = new Date("2026-06-21T12:00:00Z");

    expect(readClock(PARIS, at, "civil")).toEqual(readClock(PARIS, at, "civil", "sunrise-sunset"));
  });

  test.each([
    {
      twilight: "civil",
      instant: "2026-06-21T12:00:00Z",
      kind: "day",
      start: "2026-06-21T03:04:21Z",
      end: "2026-06-21T20:40:28Z",
    },
    {
      twilight: "nautical",
      instant: "2026-12-21T20:00:00Z",
      kind: "night",
      start: "2026-12-21T17:13:44Z",
      end: "2026-12-22T06:24:03Z",
    },
    {
      twilight: "astronomical",
      instant: "2026-12-21T12:00:00Z",
      kind: "day",
      start: "2026-12-21T05:45:02Z",
      end: "2026-12-21T17:52:15Z",
    },
  ] as const)("in Paris, a $kind runs between the $twilight Dawn and Dusk", (reference) => {
    const { twilight, instant, kind, start, end } = reference;
    const snapshot = readClock(PARIS, new Date(instant), twilight, "dawn-dusk");

    expectPhase(snapshot, kind, start, end);
    expect(snapshot.longPhase).toBeNull();
  });

  test("a Day from Dawn to Dusk holds the Sunrise and Sunset, and its length spans them", () => {
    const at = new Date("2026-06-21T12:00:00Z");
    const snapshot = readClock(PARIS, at, "civil", "dawn-dusk");
    const fromSunrise = readClock(PARIS, at, "civil");

    expect(snapshot.dawn).toEqual(snapshot.phase.start);
    expect(snapshot.sunrise).toEqual(fromSunrise.phase.start);
    expect(snapshot.sunset).toEqual(fromSunrise.phase.end);
    expect(snapshot.dusk).toEqual(snapshot.phase.end);
    // 03:04:21 → 20:40:28
    expect(Math.abs(snapshot.lastDayLength - (17 * 60 + 36) * 60_000)).toBeLessThanOrEqual(
      2 * TOLERANCE_MS,
    );
    expect(snapshot.previousDayLength).not.toBeNull();
  });

  test("a Night from Dusk to Dawn lies between the Sunset before and the Sunrise after", () => {
    const evening = new Date("2026-12-21T17:00:00Z");
    const snapshot = readClock(PARIS, new Date("2026-12-21T20:00:00Z"), "nautical", "dawn-dusk");
    const fromSunset = readClock(PARIS, evening, "nautical");

    expect(snapshot.sunset).toEqual(fromSunset.phase.start);
    expect(snapshot.dusk).toEqual(snapshot.phase.start);
    expect(snapshot.dawn).toEqual(snapshot.phase.end);
    expect(snapshot.sunrise).toEqual(fromSunset.phase.end);
  });

  test("gives exactly the Day length the clock read the day before", () => {
    const yesterday = readClock(PARIS, new Date("2026-03-19T12:00:00Z"), "nautical", "dawn-dusk");
    const today = readClock(PARIS, new Date("2026-03-20T12:00:00Z"), "nautical", "dawn-dusk");

    expect(today.previousDayLength).toBe(yesterday.lastDayLength);
  });

  describe("in June weeks with no astronomical Dusk in Paris", () => {
    // sunrise-sunset.org: the last astronomical Dusk is at 23:39 on 11 June, and the first
    // Dawn after the weeks with none at 00:07 on 1 July.
    const LAST_DUSK = Date.parse("2026-06-11T23:39:22Z");
    const FIRST_DAWN = Date.parse("2026-07-01T00:07:43Z");

    function read(instant: string) {
      return readClock(PARIS, new Date(instant), "astronomical", "dawn-dusk");
    }

    test("a single Day runs on for weeks, with no dark night", () => {
      const snapshot = read("2026-06-21T12:00:00Z");

      expect(snapshot.phase.kind).toBe("day");
      expect(snapshot.phase.start.getTime()).toBeGreaterThan(LAST_DUSK);
      expect(snapshot.phase.start.getTime()).toBeLessThan(Date.parse("2026-06-12T01:00:00Z"));
      expect(snapshot.phase.end.getTime()).toBeGreaterThan(Date.parse("2026-06-30T23:00:00Z"));
      expect(snapshot.phase.end.getTime()).toBeLessThan(FIRST_DAWN);
      expect(snapshot.longPhase).toBe("no-dark-night");
      expect(snapshot.previousDayLength).toBeNull();
    });

    test("lists the Sunrise and Sunset of the day, or around the night", () => {
      const fromSunrise = (instant: string) => readClock(PARIS, new Date(instant)).phase;
      const noon = fromSunrise("2026-06-21T12:00:00Z");
      const night = fromSunrise("2026-06-21T23:00:00Z");

      expect(read("2026-06-21T12:00:00Z")).toMatchObject({
        sunrise: noon.start,
        sunset: noon.end,
      });
      expect(read("2026-06-21T23:00:00Z")).toMatchObject({
        sunset: night.start,
        sunrise: night.end,
      });
    });

    test("the Day around it is counted as usual", () => {
      expect(read("2026-06-05T12:00:00Z").longPhase).toBeNull();
      expect(read("2026-07-10T12:00:00Z").longPhase).toBeNull();
    });
  });

  describe("in Tromsø", () => {
    // Near the polar circle the Sun crosses −6° at a shallow angle: sunrise-sunset.org and
    // the clock differ by up to a quarter of an hour.
    const GRAZING_TOLERANCE_MS = 20 * 60_000;

    test("a civil Day runs from April to August, around the Polar day", () => {
      const snapshot = readClock(TROMSØ, new Date("2026-06-21T12:00:00Z"), "civil", "dawn-dusk");

      expectPhase(snapshot, "day", "2026-04-27T23:07Z", "2026-08-14T22:28Z", GRAZING_TOLERANCE_MS);
      expect(snapshot.longPhase).toBe("polar-day");
      expectNear(snapshot.sunrise ?? new Date(Number.NaN), "2026-05-17T22:53Z", 3 * 60_000);
      expectNear(snapshot.sunset ?? new Date(Number.NaN), "2026-07-25T22:36Z", 3 * 60_000);
    });

    test("before the Polar day, the same Day has no dark night", () => {
      const snapshot = readClock(TROMSØ, new Date("2026-05-10T12:00:00Z"), "civil", "dawn-dusk");

      expect(snapshot.longPhase).toBe("no-dark-night");
    });

    test("in the Polar night, a short civil Day has no Sunrise or Sunset", () => {
      const snapshot = readClock(TROMSØ, new Date("2026-12-21T11:00:00Z"), "civil", "dawn-dusk");

      expectPhase(snapshot, "day", "2026-12-21T08:31:12Z", "2026-12-21T12:53:13Z");
      expect([snapshot.sunrise, snapshot.sunset]).toEqual([null, null]);
    });

    test("counting from Sunrise to Sunset, a Polar night lists the Dawn and Dusk of the day", () => {
      const snapshot = readClock(TROMSØ, new Date("2026-12-21T11:00:00Z"), "civil");

      expect(snapshot.longPhase).toBe("polar-night");
      expectNear(snapshot.dawn ?? new Date(Number.NaN), "2026-12-21T08:31:12Z");
      expectNear(snapshot.dusk ?? new Date(Number.NaN), "2026-12-21T12:53:13Z");
    });
  });

  test("a Night longer than 24 hours is a Polar night", () => {
    const snapshot = readClock(
      LONGYEARBYEN,
      new Date("2026-12-21T12:00:00Z"),
      "civil",
      "dawn-dusk",
    );

    expect(snapshot.phase.kind).toBe("night");
    expect(snapshot.longPhase).toBe("polar-night");
  });
});
