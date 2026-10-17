// Turning a clock snapshot into what the front ends display.
import type { ClockSnapshot } from "./clock.ts";
import type { Location, LocationInUse, LocationSource } from "./location.ts";
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, MS_PER_DAY, MS_PER_MINUTE } from "./time.ts";

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
  /**
   * BCP 47 locale in which Civil times and dates are shown; it may differ from the language
   * of `translate`, as LC_TIME may from LC_MESSAGES.
   */
  readonly locale: string;
  readonly translate: Translate;
  readonly location: LocationInUse;
}

/** The Sun arc: the Sun (during a Day) or the Moon (during a Night) placed at the Progress. */
export interface SunArc {
  readonly body: "sun" | "moon";
  /** From 0 (rising end of the arc) to 1 (setting end). */
  readonly progress: number;
  /**
   * The part of the arc the Reading measures, to draw emphasised so the bar tells which Reading
   * it shows: the way still ahead of the body, or the way already behind it.
   */
  readonly emphasis: "ahead" | "behind";
}

export interface Bar {
  /** The Sun arc, or null when no Location is known. */
  readonly arc: SunArc | null;
  /**
   * The Reading as a duration, the polar state once that duration exceeds 24 hours, or the
   * "Location unknown" state.
   */
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
  /**
   * The label of an entry leading to the Manual location settings, offered when no Location
   * is known; null otherwise.
   */
  readonly manualLocationEntry: string | null;
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
        emphasis: READING_RULES[options.reading].emphasis,
      },
      text: barText(snapshot, options),
    },
    menu: { rows: menuRows(snapshot, options), manualLocationEntry: null },
  };
}

/** What to display when no Location is known, so the clock cannot be read. */
export function presentLocationUnknown(translate: Translate): ViewModel {
  return {
    bar: { arc: null, text: translate("Location unknown") },
    menu: { rows: [], manualLocationEntry: translate("Set a location manually…") },
  };
}

/** What to display when the clock failed to be read, rather than a stale or broken Reading. */
export function presentError(translate: Translate): ViewModel {
  return {
    // Translators: shown in the top bar instead of the Reading when something went wrong.
    bar: { arc: null, text: translate("Error") },
    menu: { rows: [], manualLocationEntry: null },
  };
}

function barText(snapshot: ClockSnapshot, options: PresentationOptions): string {
  const { translate } = options;
  const minutes = READING_RULES[options.reading].minutes(snapshot);
  if (minutes <= MINUTES_PER_DAY) return formatDuration(minutes, translate);
  return snapshot.phase.kind === "day" ? translate("Polar day") : translate("Polar night");
}

function menuRows(snapshot: ClockSnapshot, options: PresentationOptions): MenuRow[] {
  const { translate } = options;
  const { phase, instant } = snapshot;
  const isDay = phase.kind === "day";
  const phaseLength = Math.round((phase.end.getTime() - phase.start.getTime()) / MS_PER_MINUTE);
  const otherReading = READING_RULES[READING_RULES[options.reading].other];

  const civilTimeRow = (label: string, time: Date | null): MenuRow[] =>
    time ? [{ label, value: formatCivilTime(time, instant, options) }] : [];
  const dawn = civilTimeRow(translate("Dawn"), snapshot.dawn);
  const sunrise = civilTimeRow(translate("Sunrise"), isDay ? phase.start : phase.end);
  const sunset = civilTimeRow(translate("Sunset"), isDay ? phase.end : phase.start);
  const dusk = civilTimeRow(translate("Dusk"), snapshot.dusk);

  const rows: MenuRow[] = [
    // In the order they happen: Dawn and Dusk lie outside a Day, and inside a Night.
    ...(isDay
      ? [...dawn, ...sunrise, ...sunset, ...dusk]
      : [...sunset, ...dusk, ...dawn, ...sunrise]),
    {
      label: isDay ? translate("Day length") : translate("Night length"),
      value: formatDuration(phaseLength, translate),
    },
    {
      label: otherReading.label(translate),
      value: formatDuration(otherReading.minutes(snapshot), translate),
    },
  ];
  // During a Day, the Phase length above is already the Day length.
  if (!isDay) {
    rows.push({
      label: translate("Day length"),
      value: formatDuration(Math.round(snapshot.lastDayLength / MS_PER_MINUTE), translate),
    });
  }
  rows.push(locationRow(options));
  return rows;
}

/** What each Reading measures, and how the bar and the menu show it. */
const READING_RULES: Readonly<
  Record<
    Reading,
    {
      /** The Reading in whole minutes, rounded towards "less time". */
      readonly minutes: (snapshot: ClockSnapshot) => number;
      readonly label: (translate: Translate) => string;
      /** The part of the Sun arc the Reading measures. */
      readonly emphasis: SunArc["emphasis"];
      /** The Reading the menu shows alongside this one in the bar. */
      readonly other: Reading;
    }
  >
> = {
  remaining: {
    // Rounded up, so the clock never claims the Solar event has arrived before it has.
    minutes: (snapshot) => Math.ceil(snapshot.remaining / MS_PER_MINUTE),
    label: (translate) => translate("Remaining time"),
    emphasis: "ahead",
    other: "elapsed",
  },
  elapsed: {
    minutes: (snapshot) => Math.floor(snapshot.elapsed / MS_PER_MINUTE),
    label: (translate) => translate("Elapsed time"),
    emphasis: "behind",
    other: "remaining",
  },
};

function locationRow(options: PresentationOptions): MenuRow {
  const { location, translate } = options;
  return {
    label: locationLabel(location.source, translate),
    value: location.name ?? formatCoordinates(location, options),
  };
}

function locationLabel(source: LocationSource, translate: Translate): string {
  switch (source) {
    case "automatic":
      return translate("Automatic location");
    case "manual":
      return translate("Manual location");
    case "last-known":
      return translate("Last known location");
  }
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
 *
 * "Yesterday" and "tomorrow" are messages, so they speak the language of the other messages;
 * the time and the date follow `locale`, which may differ (see `PresentationOptions`).
 */
function formatCivilTime(instant: Date, now: Date, options: PresentationOptions): string {
  const { locale, timeZone, translate } = options;
  const time = new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" }).format(instant);
  switch (civilDayNumber(instant, timeZone) - civilDayNumber(now, timeZone)) {
    case 0:
      return time;
    case -1:
      // Translators: a Civil time on the day before today, e.g. "yesterday at 21:58".
      return fill(translate("yesterday at {time}"), { time });
    case 1:
      // Translators: a Civil time on the day after today, e.g. "tomorrow at 05:47".
      return fill(translate("tomorrow at {time}"), { time });
    default: {
      const date = new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(instant);
      // Translators: a Civil time further away than yesterday or tomorrow, e.g. "Thu 18 Jun at
      // 21:58"; {date} follows the locale of dates and times.
      return fill(translate("{date} at {time}"), { date, time });
    }
  }
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
  if (totalMinutes > MINUTES_PER_DAY) {
    // Translators: a duration over 24 hours, e.g. "68d 23h", for a Polar day or Polar night.
    return fill(translate("{days}d {hours}h"), {
      days: String(Math.floor(totalMinutes / MINUTES_PER_DAY)),
      hours: String(Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR)),
    });
  }
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
