// Turning a clock snapshot into what the front ends display.
import { civilDaysBetween } from "./civilTime.ts";
import type { ClockSnapshot } from "./clock.ts";
import type { Location, LocationInUse, LocationSource } from "./location.ts";
import { type DueNotification, NOTIFIABLE_EVENTS, type NotifiableEvent } from "./notifications.ts";
import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from "./time.ts";

/** Every Reading the user can choose, the default first. */
export const READINGS = ["remaining", "elapsed", "elapsed-and-remaining"] as const;

/** What the clock displays: the Remaining time, the Elapsed time, or both. */
export type Reading = (typeof READINGS)[number];

/** Every choice of what the bar shows, the default first. */
export const BAR_CONTENTS = ["arc-and-duration", "arc", "duration"] as const;

/** What the bar shows: the Sun arc and the Reading, or only one of them. */
export type BarContent = (typeof BAR_CONTENTS)[number];

/** Translates an English source message; front ends inject gettext or an equivalent. */
export type Translate = (message: string) => string;

/**
 * Translates an English source message with a singular and a plural form, for `count`; front
 * ends inject ngettext or an equivalent.
 */
export type TranslatePlural = (singular: string, plural: string, count: number) => string;

/** Every format of the desktop clock, in which Civil times are shown. */
export const CLOCK_FORMATS = ["24h", "12h"] as const;

/** Whether Civil times are shown on a 24-hour or a 12-hour clock, as the desktop clock is. */
export type ClockFormat = (typeof CLOCK_FORMATS)[number];

/** How to speak to the user: in which language, and with which times and dates. */
export interface Localisation {
  /** IANA time zone in which Civil times and dates are counted and shown. */
  readonly timeZone: string;
  /**
   * BCP 47 locale in which Civil times and dates are shown; it may differ from the language
   * of `translate`, as LC_TIME may from LC_MESSAGES.
   */
  readonly locale: string;
  /** The desktop clock's format, which Civil times follow whatever the habit of `locale`. */
  readonly clockFormat: ClockFormat;
  readonly translate: Translate;
}

export interface PresentationOptions extends Localisation {
  readonly reading: Reading;
  readonly barContent: BarContent;
  readonly location: LocationInUse;
}

/**
 * The Sun arc: the Sun (during a Day) or the Moon in its phase (during a Night) placed at the
 * Progress.
 */
export type SunArc = SunOnArc | MoonOnArc;

interface BodyOnArc {
  /** From 0 (rising end of the arc) to 1 (setting end). */
  readonly progress: number;
  /**
   * The part of the arc the Reading measures, to draw emphasised so the bar tells which Reading
   * it shows: the way still ahead of the body, the way already behind it, or the whole arc, in
   * which case no part stands out.
   */
  readonly emphasis: "ahead" | "behind" | "whole";
}

export interface SunOnArc extends BodyOnArc {
  readonly body: "sun";
}

export interface MoonOnArc extends BodyOnArc {
  readonly body: "moon";
  /** The illuminated fraction of the Moon's disc, from 0 (New Moon) to 1 (Full Moon). */
  readonly illuminated: number;
  /**
   * The side of the disc that is lit, as seen from the Location: the side of the Sun, which
   * is the right of a waxing Moon in the northern hemisphere and its left in the southern one.
   */
  readonly litSide: "left" | "right";
}

export interface Bar {
  /** The Sun arc, or null when no Location is known or the user chose the duration only. */
  readonly arc: SunArc | null;
  /**
   * The Reading as a duration, the Long Phase once that duration exceeds 24 hours, or the
   * "Location unknown" or "Error" state; null when the user chose the Sun arc only.
   */
  readonly text: string | null;
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
      arc: options.barContent === "duration" ? null : sunArc(snapshot, options),
      text: options.barContent === "arc" ? null : barText(snapshot, options),
    },
    menu: { rows: menuRows(snapshot, options), manualLocationEntry: null },
  };
}

export interface NotificationPresentationOptions extends Localisation {
  readonly location: LocationInUse;
}

/** A notification of an event, as the desktop shows it. */
export interface NotificationView {
  /** Which event is coming, and in how long: e.g. "Sunset in 30 min". */
  readonly title: string;
  /** When and where: e.g. "21:58 · Paris", or "tomorrow at 03:04 · Paris". */
  readonly body: string;
}

/** The notification of an event, sent at `now`. */
export function presentNotification(
  notification: DueNotification,
  now: Date,
  options: NotificationPresentationOptions,
): NotificationView {
  const { translate } = options;
  const event = eventNames(translate)[notification.event];
  // Rounded up, like the Remaining time, so the event never seems closer than it is.
  const minutes = Math.ceil((notification.instant.getTime() - now.getTime()) / MS_PER_MINUTE);
  return {
    title:
      minutes > 0
        ? // Translators: a notification, e.g. "Sunset in 30 min".
          fill(translate("{event} in {duration}"), {
            event,
            duration: formatDuration(minutes, translate),
          })
        : // Translators: a notification at the moment of an event, e.g. "Sunset now".
          fill(translate("{event} now"), { event }),
    body: `${formatCivilTime(notification.instant, now, options)} · ${describeLocation(options.location, options)}`,
  };
}

/** The name of each of Dawn, Sunrise, Sunset and Dusk. */
export function eventNames(translate: Translate): Readonly<Record<NotifiableEvent, string>> {
  return {
    dawn: translate("Dawn"),
    sunrise: translate("Sunrise"),
    sunset: translate("Sunset"),
    dusk: translate("Dusk"),
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

function sunArc(snapshot: ClockSnapshot, options: PresentationOptions): SunArc {
  const onArc = { progress: snapshot.progress, emphasis: READING_RULES[options.reading].emphasis };
  if (snapshot.phase.kind === "day") return { body: "sun", ...onArc };
  const { illuminated, waxing } = snapshot.moon;
  // Seen from the south, the Moon is upside down; the equator counts as north.
  const north = options.location.latitude >= 0;
  return { body: "moon", ...onArc, illuminated, litSide: waxing === north ? "right" : "left" };
}

function barText(snapshot: ClockSnapshot, options: PresentationOptions): string {
  const { translate } = options;
  const minutes = (duration: Duration): number => DURATION_RULES[duration].minutes(snapshot);
  const [first, second] = READING_RULES[options.reading].durations;
  // A Long Phase is named as soon as either duration exceeds 24 hours.
  if (
    Math.max(minutes(first), second ? minutes(second) : 0) <= MINUTES_PER_DAY ||
    !snapshot.longPhase
  ) {
    if (!second) return formatDuration(minutes(first), translate);
    // Translators: both Readings in the top bar, e.g. "6h 10m / 7h 50m"; the Elapsed time
    // first, as on a video player.
    return fill(translate("{elapsed} / {remaining}"), {
      elapsed: formatDuration(minutes(first), translate),
      remaining: formatDuration(minutes(second), translate),
    });
  }
  switch (snapshot.longPhase) {
    case "polar-day":
      return translate("Polar day");
    case "polar-night":
      return translate("Polar night");
    case "no-dark-night":
      // Translators: shown in the top bar instead of the Reading while, counting from Dawn to
      // Dusk, the Sun does not get far enough below the horizon for Dusk for over 24 hours.
      return translate("No dark night");
  }
}

function menuRows(snapshot: ClockSnapshot, options: PresentationOptions): MenuRow[] {
  const { translate } = options;
  const { phase, instant } = snapshot;
  const isDay = phase.kind === "day";
  // The duration the bar does not show, if any.
  const shown: readonly Duration[] = READING_RULES[options.reading].durations;
  const hidden = DURATIONS.filter((duration) => !shown.includes(duration));
  const names = eventNames(translate);
  const phaseLength = phase.end.getTime() - phase.start.getTime();
  const dayLengthChange =
    snapshot.previousDayLength === null
      ? null
      : snapshot.lastDayLength - snapshot.previousDayLength;

  const rows: MenuRow[] = [
    // In the order they happen, whichever two of them bound the Phase.
    ...NOTIFIABLE_EVENTS.flatMap((event) => {
      const time = snapshot[event];
      return time ? [{ label: names[event], time }] : [];
    })
      .sort((a, b) => a.time.getTime() - b.time.getTime())
      .map(({ label, time }) => ({ label, value: formatCivilTime(time, instant, options) })),
    isDay
      ? {
          label: translate("Day length"),
          value: formatDayLength(phaseLength, dayLengthChange, translate),
        }
      : {
          label: translate("Night length"),
          value: formatDuration(Math.round(phaseLength / MS_PER_MINUTE), translate),
        },
    ...hidden.map((duration) => ({
      label: DURATION_RULES[duration].label(translate),
      value: formatDuration(DURATION_RULES[duration].minutes(snapshot), translate),
    })),
  ];
  // During a Day, the Phase length above is already the Day length.
  if (!isDay) {
    rows.push({
      label: translate("Day length"),
      value: formatDayLength(snapshot.lastDayLength, dayLengthChange, translate),
    });
  }
  rows.push(locationRow(options));
  return rows;
}

/** The durations a Reading is made of. */
const DURATIONS = ["remaining", "elapsed"] as const;

type Duration = (typeof DURATIONS)[number];

/** How each duration is measured, and named in the menu. */
const DURATION_RULES: Readonly<
  Record<
    Duration,
    {
      /** The duration in whole minutes, rounded towards "less time". */
      readonly minutes: (snapshot: ClockSnapshot) => number;
      readonly label: (translate: Translate) => string;
    }
  >
> = {
  remaining: {
    // Rounded up, so the clock never claims the Solar event has arrived before it has.
    minutes: (snapshot) => Math.ceil(snapshot.remaining / MS_PER_MINUTE),
    label: (translate) => translate("Remaining time"),
  },
  elapsed: {
    minutes: (snapshot) => Math.floor(snapshot.elapsed / MS_PER_MINUTE),
    label: (translate) => translate("Elapsed time"),
  },
};

/** What each Reading shows in the bar; the menu shows the duration it leaves out. */
const READING_RULES: Readonly<
  Record<
    Reading,
    {
      /** The durations shown, one or two, in the order of the bar. */
      readonly durations: readonly [Duration] | readonly [Duration, Duration];
      /** The part of the Sun arc the Reading measures. */
      readonly emphasis: SunArc["emphasis"];
    }
  >
> = {
  remaining: { durations: ["remaining"], emphasis: "ahead" },
  elapsed: { durations: ["elapsed"], emphasis: "behind" },
  "elapsed-and-remaining": { durations: ["elapsed", "remaining"], emphasis: "whole" },
};

function locationRow(options: PresentationOptions): MenuRow {
  const { location, translate } = options;
  return {
    label: locationLabel(location.source, translate),
    value: describeLocation(location, options),
  };
}

/** The Location in use, by its name, or by its coordinates when it has none. */
function describeLocation(location: LocationInUse, localisation: Localisation): string {
  return location.name ?? formatCoordinates(location, localisation);
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

function formatCoordinates(
  location: Location,
  options: Pick<Localisation, "locale" | "translate">,
): string {
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
 * the time and the date follow `locale`, which may differ (see `PresentationOptions`), on the
 * clock of `clockFormat`.
 */
function formatCivilTime(instant: Date, now: Date, options: Localisation): string {
  const { locale, timeZone, translate } = options;
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    // On a 12-hour clock the hour is not padded ("6:07 PM"), as on the GNOME clock, although
    // the short style of some locales pads it ("06:07 PM" in French).
    ...(options.clockFormat === "12h"
      ? { hour: "numeric", minute: "2-digit", hourCycle: "h12" }
      : { timeStyle: "short", hourCycle: "h23" }),
  }).format(instant);
  switch (civilDaysBetween(now, instant, timeZone)) {
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

export function formatDuration(totalMinutes: number, translate: Translate): string {
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

/**
 * A Day length in milliseconds, with its trend when its `change` since the Day before is known:
 * e.g. "10h 43m ↓3m".
 */
export function formatDayLength(
  length: number,
  change: number | null,
  translate: Translate,
): string {
  const trend = change === null ? "" : formatDayLengthChange(change, translate);
  return formatDuration(Math.round(length / MS_PER_MINUTE), translate) + trend;
}

/**
 * A change of Day length in milliseconds, to follow a Day length: e.g. " ↑3m" for 3 minutes
 * longer, or nothing when the change rounds to no second.
 */
function formatDayLengthChange(change: number, translate: Translate): string {
  const seconds = Math.round(Math.abs(change) / MS_PER_SECOND);
  if (seconds === 0) return "";
  const arrow = change > 0 ? "↑" : "↓";
  const amount =
    seconds < SECONDS_PER_MINUTE
      ? // Translators: how much longer or shorter a Day is than the Day before, under a
        // minute, after an arrow: e.g. "↑45s".
        fill(translate("{seconds}s"), { seconds: String(seconds) })
      : // Translators: how much longer or shorter a Day is than the Day before, after an
        // arrow: e.g. "↓3m".
        fill(translate("{minutes}m"), {
          minutes: String(Math.round(Math.abs(change) / MS_PER_MINUTE)),
        });
  return ` ${arrow}${amount}`;
}

/** Replaces each `{name}` placeholder of a translated template. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
