// The year at a Location: its Solstices and Equinoxes, and its Day length date by date.
import { epochMsOf, julianCenturiesSinceJ2000, radians } from "./astronomy.ts";
import { civilDayNumber, startOfCivilDay } from "./civilTime.ts";
import { AltitudeCrossings, SOLAR_EVENT_ALTITUDE } from "./clock.ts";
import type { Location } from "./location.ts";
import { MS_PER_DAY, MS_PER_SECOND } from "./time.ts";

// The difference between Terrestrial Time, in which the instants below come out, and UTC. It
// was 69 s in the 2020s and drifts by about a second a year: negligible next to the minute.
const DELTA_T_MS = 69 * MS_PER_SECOND;

/** The year at a Location, as the Year page shows it. */
export interface YearReading {
  /** The instant the year was read at. */
  readonly instant: Date;
  /** The civil year of the instant read, in the time zone it was read for. */
  readonly year: number;
  /** The Day length of each civil date of the year: see `dayLengthsByDate`. */
  readonly dayLengths: readonly number[];
  /** The Solstices and Equinoxes of the year and of the next, so that the next ones are there. */
  readonly solsticesAndEquinoxes: readonly SolsticeOrEquinox[];
}

/** A Solstice or an Equinox, named by the month it falls in, as in both hemispheres. */
export interface SolsticeOrEquinox {
  readonly kind: "solstice" | "equinox";
  readonly month: 3 | 6 | 9 | 12;
  readonly instant: Date;
}

// Meeus, "Astronomical Algorithms", table 27.B (years 1000 to 3000): the mean instant of each
// Solstice and Equinox as a Julian Ephemeris Day, a polynomial in millennia from 2000.
const MEAN_INSTANTS: readonly {
  readonly kind: SolsticeOrEquinox["kind"];
  readonly month: SolsticeOrEquinox["month"];
  readonly terms: readonly [number, number, number, number, number];
}[] = [
  { kind: "equinox", month: 3, terms: [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057] },
  { kind: "solstice", month: 6, terms: [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003] },
  { kind: "equinox", month: 9, terms: [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078] },
  {
    kind: "solstice",
    month: 12,
    terms: [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
  },
];

// Meeus, table 27.C: the periodic terms correcting the mean instants, as amplitude A, phase B
// in degrees and rate C in degrees per Julian century.
const PERIODIC_TERMS: readonly (readonly [number, number, number])[] = [
  [485, 324.96, 1934.136],
  [203, 337.23, 32964.467],
  [199, 342.08, 20.186],
  [182, 27.85, 445267.112],
  [156, 73.14, 45036.886],
  [136, 171.52, 22518.443],
  [77, 222.54, 65928.934],
  [74, 296.72, 3034.906],
  [70, 243.58, 9037.513],
  [58, 119.81, 33718.147],
  [52, 297.17, 150.678],
  [50, 21.02, 2281.226],
  [45, 247.54, 29929.562],
  [44, 325.15, 31555.956],
  [29, 60.93, 4443.417],
  [18, 155.12, 67555.328],
  [17, 288.79, 4562.452],
  [16, 198.04, 62894.029],
  [14, 199.76, 31436.921],
  [12, 95.39, 14577.848],
  [12, 287.11, 31931.756],
  [12, 320.81, 34777.259],
  [9, 227.73, 1222.114],
  [8, 15.45, 16859.074],
];

/** The Solstices and Equinoxes of a calendar year, in order, for years 1000 to 3000. */
export function solsticesAndEquinoxes(year: number): SolsticeOrEquinox[] {
  const millennia = (year - 2000) / 1000;
  return MEAN_INSTANTS.map(({ kind, month, terms }) => {
    const meanJulianDay = terms.reduce((sum, term, power) => sum + term * millennia ** power, 0);
    const t = julianCenturiesSinceJ2000(meanJulianDay);
    const w = radians(35999.373 * t - 2.47);
    const lambdaCorrection = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
    const periodic = PERIODIC_TERMS.reduce(
      (sum, [amplitude, phase, rate]) => sum + amplitude * Math.cos(radians(phase + rate * t)),
      0,
    );
    const julianDay = meanJulianDay + (0.00001 * periodic) / lambdaCorrection;
    const epochMs = epochMsOf(julianDay) - DELTA_T_MS;
    return { kind, month, instant: new Date(Math.round(epochMs)) };
  });
}

/**
 * For each civil date of a calendar year in `timeZone`, from 1 January, the milliseconds the
 * Sun spends above the horizon at `location` within that date: the Day length, cut at
 * midnight, so that a date of Polar day counts 24 hours and a date of Polar night none.
 */
export function dayLengthsByDate(location: Location, year: number, timeZone: string): number[] {
  const events = new AltitudeCrossings(location, SOLAR_EVENT_ALTITUDE);
  const firstDay = Date.UTC(year, 0, 1) / MS_PER_DAY;
  const dayCount = Date.UTC(year + 1, 0, 1) / MS_PER_DAY - firstDay;

  // Walks the Solar events through the year once, from the state of the Sun at its start.
  let cursor = startOfCivilDay(firstDay, timeZone);
  let above = events.isAbove(cursor);
  let nextEvent = events.earliestAfter(cursor);
  const lengths: number[] = [];
  for (let day = 1; day <= dayCount; day++) {
    const endOfDate = startOfCivilDay(firstDay + day, timeZone);
    let length = 0;
    while (nextEvent < endOfDate) {
      if (above) length += nextEvent - cursor;
      cursor = nextEvent;
      above = !above;
      nextEvent = events.earliestAfter(nextEvent);
    }
    if (above) length += endOfDate - cursor;
    cursor = endOfDate;
    lengths.push(length);
  }
  return lengths;
}

/** Reads the year at `location` for the civil year `instant` falls in, in `timeZone`. */
export function readYear(location: Location, instant: Date, timeZone: string): YearReading {
  const year = new Date(civilDayNumber(instant, timeZone) * MS_PER_DAY).getUTCFullYear();
  return {
    instant,
    year,
    dayLengths: dayLengthsByDate(location, year, timeZone),
    solsticesAndEquinoxes: [...solsticesAndEquinoxes(year), ...solsticesAndEquinoxes(year + 1)],
  };
}
