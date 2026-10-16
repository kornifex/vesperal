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
  readonly phase: Phase;
  /** Milliseconds from the instant read until the end of the Phase; always positive. */
  readonly remaining: number;
  /** Milliseconds from the start of the Phase until the instant read. */
  readonly elapsed: number;
  /** Fraction of the Phase already elapsed, from 0 (included) to 1 (excluded). */
  readonly progress: number;
}

/**
 * Reads the clock at `instant` for `location`: the current Phase, as the half-open interval
 * [start, end) between two consecutive Solar events, and where `instant` stands within it.
 */
export function readClock(location: Location, instant: Date): ClockSnapshot {
  const now = instant.getTime();
  const isAboveHorizon = (epochMs: number): boolean =>
    solarAltitude(location, epochMs) >= SOLAR_EVENT_ALTITUDE;

  // The first millisecond after `from` (exclusive) up to `to` where the Sun is on the same
  // side of the horizon as at `to`, if it crosses the horizon in between.
  const crossing = (from: number, to: number): number | undefined => {
    const side = isAboveHorizon(to);
    if (isAboveHorizon(from) === side) return undefined;
    let before = from;
    let after = to;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (isAboveHorizon(middle) === side) after = middle;
      else before = middle;
    }
    return after;
  };

  const gridStart = Math.floor(now / SEARCH_STEP_MS) * SEARCH_STEP_MS;

  let start: number | undefined;
  for (let from = gridStart; from > now - SEARCH_HORIZON_MS; from -= SEARCH_STEP_MS) {
    const event = crossing(from, from + SEARCH_STEP_MS);
    if (event !== undefined && event <= now) {
      start = event;
      break;
    }
  }

  let end: number | undefined;
  for (let from = gridStart; from < now + SEARCH_HORIZON_MS; from += SEARCH_STEP_MS) {
    const event = crossing(from, from + SEARCH_STEP_MS);
    if (event !== undefined && event > now) {
      end = event;
      break;
    }
  }

  if (start === undefined || end === undefined) {
    throw new Error("No Solar event found within a year");
  }

  return {
    phase: {
      kind: isAboveHorizon(now) ? "day" : "night",
      start: new Date(start),
      end: new Date(end),
    },
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
  };
}
