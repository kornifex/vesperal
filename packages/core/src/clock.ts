// Seam 1: reading the clock at an instant and a Location.
import type { Location } from "./location.ts";
import { culmination, culminationIndexAt, solarAltitude } from "./solar.ts";
import { MS_PER_DAY } from "./time.ts";

/** Solar altitude of Sunrise and Sunset: the upper limb plus standard refraction. */
const SOLAR_EVENT_ALTITUDE = -0.833;

// Searching a little over a year each way reaches the next and previous Solar events even at
// the poles, where there is one Sunrise and one Sunset a year: 2 culminations a day.
const SEARCH_HORIZON_CULMINATIONS = 2 * 370;

/** Every Twilight the user can choose, the default first. */
export const TWILIGHTS = ["civil", "nautical", "astronomical"] as const;

/** How far below the horizon the Sun must be for Dawn and Dusk. */
export type Twilight = (typeof TWILIGHTS)[number];

/** Geometric altitude of the Sun's centre at Dawn and Dusk, without refraction. */
const TWILIGHT_ALTITUDE: Readonly<Record<Twilight, number>> = {
  civil: -6,
  nautical: -12,
  astronomical: -18,
};

export type PhaseKind = "day" | "night";

export interface Phase {
  readonly kind: PhaseKind;
  /** The Solar event that opens the Phase (Sunrise for a Day, Sunset for a Night). */
  readonly start: Date;
  /** The Solar event that closes the Phase. */
  readonly end: Date;
  /** Whether the Phase lasts longer than 24 hours: a Polar day or a Polar night. */
  readonly isPolar: boolean;
}

export interface ClockSnapshot {
  /** The instant the clock was read at. */
  readonly instant: Date;
  readonly phase: Phase;
  /** Milliseconds from the instant read until the end of the Phase; always positive. */
  readonly remaining: number;
  /** Milliseconds from the start of the Phase until the instant read. */
  readonly elapsed: number;
  /** Fraction of the Phase already elapsed, from 0 (included) to 1 (excluded). */
  readonly progress: number;
  /** Milliseconds from Sunrise to Sunset of the most recent Day (the current one if any). */
  readonly lastDayLength: number;
  /**
   * The Dawn before the Sunrise that opens or closes the Phase, or null if the Sun does not get
   * that far below the horizon in the Night before that Sunrise.
   */
  readonly dawn: Date | null;
  /**
   * The Dusk after the Sunset that opens or closes the Phase, or null if the Sun does not get
   * that far below the horizon in the Night after that Sunset.
   */
  readonly dusk: Date | null;
}

/**
 * Reads the clock at `instant` for `location`: the current Phase, as the half-open interval
 * [start, end) between two consecutive Solar events, where `instant` stands within it, and the
 * Dawn and Dusk of the chosen `twilight` around it.
 */
export function readClock(
  location: Location,
  instant: Date,
  twilight: Twilight = TWILIGHTS[0],
): ClockSnapshot {
  const now = instant.getTime();
  const events = new AltitudeCrossings(location, SOLAR_EVENT_ALTITUDE);
  const kind: PhaseKind = events.isAbove(now) ? "day" : "night";
  const start = events.latestAtOrBefore(now);
  const end = events.earliestAfter(now);
  // The Solar event before the Phase: the previous Sunset for a Day, Sunrise for a Night.
  const previous = events.latestAtOrBefore(start - 1);

  // Dawn falls in the Night before the Sunrise, and Dusk in the Night after the Sunset.
  const [sunrise, nightBeforeSunrise] = kind === "day" ? [start, previous] : [end, start];
  const [sunset, nightAfterSunset] =
    kind === "day" ? [end, events.earliestAfter(end)] : [start, end];
  const twilightCrossings = new AltitudeCrossings(location, TWILIGHT_ALTITUDE[twilight]);
  const dawn = twilightCrossings.latestAtOrBefore(sunrise);
  const dusk = twilightCrossings.earliestAfter(sunset);

  return {
    instant,
    phase: { kind, start: new Date(start), end: new Date(end), isPolar: end - start > MS_PER_DAY },
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
    lastDayLength: kind === "day" ? end - start : start - previous,
    dawn: dawn > nightBeforeSunrise ? new Date(dawn) : null,
    dusk: dusk < nightAfterSunset ? new Date(dusk) : null,
  };
}

/**
 * Finds the instants, as milliseconds since the epoch, when the Sun crosses an altitude around
 * an instant: Sunrises and Sunsets at the Solar event altitude, Dawns and Dusks at a Twilight
 * altitude.
 *
 * Each interval between two consecutive culminations holds at most one crossing, so walking
 * them in order yields the actual sequence of crossings, however short a Phase is (near the
 * polar circles a Day or a Night can last minutes, and two Sunsets can fall on the same date).
 * The intervals do not depend on the instant read, so a crossing always lands on the same
 * millisecond.
 */
class AltitudeCrossings {
  readonly #location: Location;
  readonly #altitude: number;

  constructor(location: Location, altitude: number) {
    this.#location = location;
    this.#altitude = altitude;
  }

  isAbove(epochMs: number): boolean {
    return solarAltitude(this.#location, epochMs) >= this.#altitude;
  }

  latestAtOrBefore(epochMs: number): number {
    return this.#search(epochMs, -1, (event) => event <= epochMs);
  }

  earliestAfter(epochMs: number): number {
    return this.#search(epochMs, 1, (event) => event > epochMs);
  }

  // Walks the intervals between culminations from the one containing `epochMs` in
  // `direction`, and returns the first event found that `accepts`.
  #search(epochMs: number, direction: 1 | -1, accepts: (event: number) => boolean): number {
    const first = culminationIndexAt(this.#location, epochMs);
    for (let step = 0; step < SEARCH_HORIZON_CULMINATIONS; step++) {
      const index = first + direction * step;
      const event = this.#crossing(
        culmination(this.#location, index),
        culmination(this.#location, index + 1),
      );
      if (event !== undefined && accepts(event)) return event;
    }
    // The Sun crosses every altitude down to −23° at least once a year, anywhere on Earth.
    throw new Error("No crossing found within a year");
  }

  // The first millisecond after `from` (exclusive) up to `to` where the Sun is on the same
  // side of the altitude as at `to`, if it crosses the altitude in between.
  #crossing(from: number, to: number): number | undefined {
    const side = this.isAbove(to);
    if (this.isAbove(from) === side) return undefined;
    let before = from;
    let after = to;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (this.isAbove(middle) === side) after = middle;
      else before = middle;
    }
    return after;
  }
}
