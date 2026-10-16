// Seam 1: reading the clock at an instant and a Location.
import type { Location } from "./location.ts";
import { solarAltitude } from "./solar.ts";

/** Solar altitude of Sunrise and Sunset: the upper limb plus standard refraction. */
const SOLAR_EVENT_ALTITUDE = -0.833;

// Solar events are searched on a grid aligned to the epoch, so that a given event is always
// refined from the same bracket and therefore lands on the same millisecond whatever the
// instant being read.
const SEARCH_STEP_MS = 10 * 60_000;
const SEARCH_HORIZON_MS = 366 * 86_400_000;

export type PhaseKind = "day" | "night";

export interface Phase {
  readonly kind: PhaseKind;
  /** The Solar event that opens the Phase (Sunrise for a Day, Sunset for a Night). */
  readonly start: Date;
  /** The Solar event that closes the Phase. */
  readonly end: Date;
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
}

/**
 * Reads the clock at `instant` for `location`: the current Phase, as the half-open interval
 * [start, end) between two consecutive Solar events, and where `instant` stands within it.
 */
export function readClock(location: Location, instant: Date): ClockSnapshot {
  const now = instant.getTime();
  const events = new SolarEvents(location);
  const kind: PhaseKind = events.isAboveHorizon(now) ? "day" : "night";
  const start = events.latestAtOrBefore(now);
  const end = events.earliestAfter(now);

  return {
    instant,
    phase: { kind, start: new Date(start), end: new Date(end) },
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
    lastDayLength: kind === "day" ? end - start : start - events.latestAtOrBefore(start - 1),
  };
}

/** Finds Sunrises and Sunsets, as milliseconds since the epoch, around an instant. */
class SolarEvents {
  readonly #location: Location;

  constructor(location: Location) {
    this.#location = location;
  }

  isAboveHorizon(epochMs: number): boolean {
    return solarAltitude(this.#location, epochMs) >= SOLAR_EVENT_ALTITUDE;
  }

  latestAtOrBefore(epochMs: number): number {
    return this.#search(epochMs, -1, (event) => event <= epochMs);
  }

  earliestAfter(epochMs: number): number {
    return this.#search(epochMs, 1, (event) => event > epochMs);
  }

  // Walks the grid from the step containing `epochMs` in `direction`, and returns the first
  // event found that `accepts`.
  #search(epochMs: number, direction: 1 | -1, accepts: (event: number) => boolean): number {
    const gridStart = Math.floor(epochMs / SEARCH_STEP_MS) * SEARCH_STEP_MS;
    for (let offset = 0; offset < SEARCH_HORIZON_MS; offset += SEARCH_STEP_MS) {
      const from = gridStart + direction * offset;
      const event = this.#crossing(from, from + SEARCH_STEP_MS);
      if (event !== undefined && accepts(event)) return event;
    }
    throw new Error("No Solar event found within a year");
  }

  // The first millisecond after `from` (exclusive) up to `to` where the Sun is on the same
  // side of the horizon as at `to`, if it crosses the horizon in between.
  #crossing(from: number, to: number): number | undefined {
    const side = this.isAboveHorizon(to);
    if (this.isAboveHorizon(from) === side) return undefined;
    let before = from;
    let after = to;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (this.isAboveHorizon(middle) === side) after = middle;
      else before = middle;
    }
    return after;
  }
}
