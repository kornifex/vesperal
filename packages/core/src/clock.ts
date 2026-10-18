// Reading the clock at an instant and a Location.
import type { Location } from "./location.ts";
import { type MoonPhase, moonPhase } from "./moon.ts";
import { culmination, culminationIndexAt, solarAltitude } from "./solar.ts";
import { MS_PER_DAY } from "./time.ts";

/** Solar altitude of Sunrise and Sunset: the upper limb plus standard refraction. */
export const SOLAR_EVENT_ALTITUDE = -0.833;

// Searching a little over a year each way reaches the next and previous Solar events even at
// the poles, where there is one Sunrise and one Sunset a year: 2 culminations a day for 370
// days.
const SEARCH_HORIZON_CULMINATIONS = 740;

/** Every Twilight the user can choose, the default first. */
export const TWILIGHTS = ["civil", "nautical", "astronomical"] as const;

/** How far below the horizon the Sun must be for Dawn and Dusk. */
export type Twilight = (typeof TWILIGHTS)[number];

/** Geometric altitude of the Sun's centre at Dawn and Dusk, without refraction. */
export const TWILIGHT_ALTITUDE: Readonly<Record<Twilight, number>> = {
  civil: -6,
  nautical: -12,
  astronomical: -18,
};

/** Every choice of Phase bounds, the default first. */
export const PHASE_BOUNDS = ["sunrise-sunset", "dawn-dusk"] as const;

/** The events a Phase runs between: Sunrise and Sunset, or Dawn and Dusk (see ADR 0003). */
export type PhaseBounds = (typeof PHASE_BOUNDS)[number];

/** The solar altitude the Sun crosses at the Phase bounds. */
export function phaseBoundsAltitude(bounds: PhaseBounds, twilight: Twilight): number {
  return bounds === "sunrise-sunset" ? SOLAR_EVENT_ALTITUDE : TWILIGHT_ALTITUDE[twilight];
}

export type PhaseKind = "day" | "night";

export interface Phase {
  readonly kind: PhaseKind;
  /** The Phase bound that opens the Phase (Sunrise or Dawn for a Day). */
  readonly start: Date;
  /** The Phase bound that closes the Phase. */
  readonly end: Date;
}

/**
 * What a Phase longer than 24 hours is at the instant read: a Polar night, a Polar day while
 * the Sun stays above the horizon, or, with Dawn and Dusk as Phase bounds, a Day with no dark
 * night while the Sun still sets.
 */
export type LongPhase = "polar-day" | "polar-night" | "no-dark-night";

export interface ClockSnapshot {
  /** The instant the clock was read at. */
  readonly instant: Date;
  readonly phase: Phase;
  /** What the Phase is if it lasts longer than 24 hours, or null. */
  readonly longPhase: LongPhase | null;
  /** Milliseconds from the instant read until the end of the Phase; always positive. */
  readonly remaining: number;
  /** Milliseconds from the start of the Phase until the instant read. */
  readonly elapsed: number;
  /** Fraction of the Phase already elapsed, from 0 (included) to 1 (excluded). */
  readonly progress: number;
  /** Milliseconds between the Phase bounds of the most recent Day (the current one if any). */
  readonly lastDayLength: number;
  /**
   * Milliseconds between the Phase bounds of the Day before the most recent Day, or null when
   * that Day does not fall on the previous date: when either Day lasts longer than 24 hours, or
   * the Night between them does.
   */
  readonly previousDayLength: number | null;
  /** The Moon phase at the instant read. */
  readonly moon: MoonPhase;
  /**
   * The Dawn, Sunrise, Sunset and Dusk around the Phase, each null when it does not happen:
   * the two that bound it, and the two others either side of it, or within it as close to the
   * instant read as can be. Dawn and Dusk lie outside a Day from Sunrise to Sunset, and Sunrise
   * and Sunset inside a Day from Dawn to Dusk.
   */
  readonly dawn: Date | null;
  readonly sunrise: Date | null;
  readonly sunset: Date | null;
  readonly dusk: Date | null;
}

/**
 * Reads the clock at `instant` for `location`: the current Phase between the chosen `bounds`,
 * as the half-open interval [start, end) where `instant` stands within it, and the Dawn,
 * Sunrise, Sunset and Dusk around it, Dawn and Dusk following the chosen `twilight`.
 */
export function readClock(
  location: Location,
  instant: Date,
  twilight: Twilight = TWILIGHTS[0],
  bounds: PhaseBounds = PHASE_BOUNDS[0],
): ClockSnapshot {
  const now = instant.getTime();
  const horizon = new AltitudeCrossings(location, SOLAR_EVENT_ALTITUDE);
  const twilightCrossings = new AltitudeCrossings(location, TWILIGHT_ALTITUDE[twilight]);
  const [phaseCrossings, otherCrossings] =
    bounds === "sunrise-sunset" ? [horizon, twilightCrossings] : [twilightCrossings, horizon];
  const kind: PhaseKind = phaseCrossings.isAbove(now) ? "day" : "night";
  const start = phaseCrossings.latestAtOrBefore(now);
  const end = phaseCrossings.earliestAfter(now);
  // The Phase bounds either side of the Phase.
  const previous = phaseCrossings.latestAtOrBefore(start - 1);
  const next = phaseCrossings.earliestAfter(end);

  // The most recent Day (the current one during a Day), and the end of the Day before it.
  const [lastDayStart, lastDayEnd, previousDayEnd] =
    kind === "day"
      ? [start, end, previous]
      : [previous, start, phaseCrossings.latestAtOrBefore(previous - 1)];
  const previousDayStart = phaseCrossings.latestAtOrBefore(previousDayEnd - 1);
  const lastDayLength = lastDayEnd - lastDayStart;
  const previousDayKnown = [
    lastDayLength,
    lastDayStart - previousDayEnd,
    previousDayEnd - previousDayStart,
  ].every((length) => length <= MS_PER_DAY);

  // The other altitude is crossed in Nights when it is the lower one (Dawn and Dusk around a
  // Day from Sunrise to Sunset), in Days when it is the higher one (Sunrise and Sunset within
  // a Day from Dawn to Dusk).
  const othersOutside = (kind === "day") === (bounds === "sunrise-sunset");
  const others = othersOutside
    ? crossingsAround(otherCrossings, previous, start, end, next)
    : crossingsWithin(otherCrossings, start, now, end);
  const [rising, falling] = kind === "day" ? [start, end] : [end, start];
  const otherRising = others.find((crossing) => otherCrossings.isAbove(crossing)) ?? null;
  const otherFalling = others.find((crossing) => !otherCrossings.isAbove(crossing)) ?? null;
  const [dawn, sunrise, sunset, dusk] =
    bounds === "sunrise-sunset"
      ? [otherRising, rising, falling, otherFalling]
      : [rising, otherRising, otherFalling, falling];

  return {
    instant,
    phase: { kind, start: new Date(start), end: new Date(end) },
    longPhase: end - start > MS_PER_DAY ? longPhase(kind, horizon, now) : null,
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
    lastDayLength,
    previousDayLength: previousDayKnown ? previousDayEnd - previousDayStart : null,
    moon: moonPhase(instant),
    dawn: dateOrNull(dawn),
    sunrise: dateOrNull(sunrise),
    sunset: dateOrNull(sunset),
    dusk: dateOrNull(dusk),
  };
}

/** What a Phase of `kind` longer than 24 hours is at `now`. */
function longPhase(kind: PhaseKind, horizon: AltitudeCrossings, now: number): LongPhase {
  if (kind === "night") return "polar-night";
  const inPolarDay =
    horizon.isAbove(now) && horizon.earliestAfter(now) - horizon.latestAtOrBefore(now) > MS_PER_DAY;
  return inPolarDay ? "polar-day" : "no-dark-night";
}

/**
 * The last crossing at or before the Phase [start, end) and the first one after it, each
 * as long as it falls before the Phase bound `previous` or after `next`.
 */
function crossingsAround(
  crossings: AltitudeCrossings,
  previous: number,
  start: number,
  end: number,
  next: number,
): number[] {
  const before = crossings.latestAtOrBefore(start);
  const after = crossings.earliestAfter(end);
  return [...(before > previous ? [before] : []), ...(after < next ? [after] : [])];
}

/**
 * Two consecutive crossings within the Phase [start, end), as close to `now` as can be: the
 * last one before it and the next one after it, or else the first two or the last two of the
 * Phase. Crossings within a Phase come in pairs, one each way, so there are two or none.
 */
function crossingsWithin(
  crossings: AltitudeCrossings,
  start: number,
  now: number,
  end: number,
): number[] {
  const latest = crossings.latestAtOrBefore(now);
  const first = latest > start ? latest : crossings.earliestAfter(now);
  if (first >= end) return [];
  const second = crossings.earliestAfter(first);
  return second < end ? [first, second] : [crossings.latestAtOrBefore(first - 1), first];
}

function dateOrNull(epochMs: number | null): Date | null {
  return epochMs === null ? null : new Date(epochMs);
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
export class AltitudeCrossings {
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
