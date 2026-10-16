// Seam 2: turning a clock snapshot into what the front ends display.
import type { ClockSnapshot } from "./clock.ts";
import type { Location, LocationInUse } from "./location.ts";

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Every Reading the user can choose, the default first. */
export const READINGS = ["remaining", "elapsed"] as const;

/** The duration the clock displays. */
export type Reading = (typeof READINGS)[number];

/** Translates an English source message; front ends inject gettext or an equivalent. */
export type Translate = (message: string) => string;

export interface PresentationOptions {
  readonly reading: Reading;
  /** IANA time zone in which Civil times are shown. */
  readonly timeZone: string;
  /** BCP 47 locale in which Civil times are shown. */
  readonly locale: string;
  readonly translate: Translate;
  readonly location: LocationInUse;
}

/** The Sun arc: the Sun (during a Day) or the Moon (during a Night) placed at the Progress. */
export interface SunArc {
  readonly body: "sun" | "moon";
  /** From 0 (rising end of the arc) to 1 (setting end). */
  readonly progress: number;
}

export interface Bar {
  readonly arc: SunArc;
  /** The Reading, as a duration. */
  readonly text: string;
}

/** A line of the menu: what it is about, and its value. */
export interface MenuRow {
  readonly label: string;
  readonly value: string;
}

/** The details of the current Phase, shown when the indicator is clicked. */
export interface Menu {
  readonly rows: readonly MenuRow[];
}

export interface ViewModel {
  readonly bar: Bar;
  readonly menu: Menu;
}

export function present(snapshot: ClockSnapshot, options: PresentationOptions): ViewModel {
  return {
    bar: {
      arc: {
        body: snapshot.phase.kind === "day" ? "sun" : "moon",
        progress: snapshot.progress,
      },
      text: formatDuration(readingMinutes(snapshot, options.reading), options.translate),
    },
    menu: { rows: menuRows(snapshot, options) },
  };
}

function menuRows(snapshot: ClockSnapshot, options: PresentationOptions): MenuRow[] {
  const { translate } = options;
  const { phase, instant } = snapshot;
  const isDay = phase.kind === "day";
  const phaseLength = Math.round((phase.end.getTime() - phase.start.getTime()) / MS_PER_MINUTE);
  const otherReading = otherReadingThan(options.reading);

  const rows: MenuRow[] = [
    {
      label: isDay ? translate("Sunrise") : translate("Sunset"),
      value: formatCivilTime(phase.start, instant, options),
    },
    {
      label: isDay ? translate("Sunset") : translate("Sunrise"),
      value: formatCivilTime(phase.end, instant, options),
    },
    {
      label: isDay ? translate("Day length") : translate("Night length"),
      value: formatDuration(phaseLength, translate),
    },
    {
      label: readingLabel(otherReading, translate),
      value: formatDuration(readingMinutes(snapshot, otherReading), translate),
    },
  ];
  // During a Day, the Phase length above is already the Day length.
  if (!isDay) {
    rows.push({
      label: translate("Day length"),
      value: formatDuration(Math.round(snapshot.lastDayLength / MS_PER_MINUTE), translate),
    });
  }
  rows.push(locationRow(options.location, options));
  return rows;
}

/** The Reading in whole minutes, each rounding erring towards "less time". */
function readingMinutes(snapshot: ClockSnapshot, reading: Reading): number {
  switch (reading) {
    case "remaining":
      // Rounded up, so the clock never claims the Solar event has arrived before it has.
      return Math.ceil(snapshot.remaining / MS_PER_MINUTE);
    case "elapsed":
      return Math.floor(snapshot.elapsed / MS_PER_MINUTE);
  }
}

/** The Reading the menu shows alongside the one in the bar. */
function otherReadingThan(reading: Reading): Reading {
  switch (reading) {
    case "remaining":
      return "elapsed";
    case "elapsed":
      return "remaining";
  }
}

function readingLabel(reading: Reading, translate: Translate): string {
  switch (reading) {
    case "remaining":
      return translate("Remaining time");
    case "elapsed":
      return translate("Elapsed time");
  }
}

function locationRow(location: LocationInUse, options: PresentationOptions): MenuRow {
  const { translate } = options;
  return {
    label:
      location.source === "manual" ? translate("Manual location") : translate("Automatic location"),
    value: location.name ?? formatCoordinates(location, options),
  };
}

function formatCoordinates(location: Location, options: PresentationOptions): string {
  const { translate } = options;
  const degrees = (angle: number): Record<string, string> => ({
    degrees: new Intl.NumberFormat(options.locale, { maximumFractionDigits: 3 }).format(
      Math.abs(angle),
    ),
  });
  // Translators: {degrees} of latitude north or south, and of longitude east or west.
  const latitude = fill(
    location.latitude >= 0 ? translate("{degrees}° N") : translate("{degrees}° S"),
    degrees(location.latitude),
  );
  const longitude = fill(
    location.longitude >= 0 ? translate("{degrees}° E") : translate("{degrees}° W"),
    degrees(location.longitude),
  );
  return `${latitude}, ${longitude}`;
}

/**
 * A Civil time, preceded by its day when that is not the day of `now`: "yesterday",
 * "tomorrow", or a date further away.
 */
function formatCivilTime(instant: Date, now: Date, options: PresentationOptions): string {
  const { locale, timeZone, translate } = options;
  const time = new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" }).format(instant);
  const days = civilDayNumber(instant, timeZone) - civilDayNumber(now, timeZone);
  if (days === 0) return time;
  const day =
    Math.abs(days) === 1
      ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day")
      : new Intl.DateTimeFormat(locale, {
          timeZone,
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(instant);
  // Translators: a Civil time on another day, e.g. "tomorrow at 05:47" or "Thu 18 Jun at 21:58".
  return fill(translate("{day} at {time}"), { day, time });
}

/** Days since the epoch of the civil date of `instant` in `timeZone`. */
function civilDayNumber(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / MS_PER_DAY;
}

function formatDuration(totalMinutes: number, translate: Translate): string {
  if (totalMinutes < MINUTES_PER_HOUR) {
    // Translators: a duration under one hour, e.g. "42 min".
    return fill(translate("{minutes} min"), { minutes: String(totalMinutes) });
  }
  // Translators: a duration over one hour, e.g. "3h 05m"; {minutes} always has two digits.
  return fill(translate("{hours}h {minutes}m"), {
    hours: String(Math.floor(totalMinutes / MINUTES_PER_HOUR)),
    minutes: String(totalMinutes % MINUTES_PER_HOUR).padStart(2, "0"),
  });
}

/** Replaces each `{name}` placeholder of a translated template. */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
