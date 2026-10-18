// Turning a year at a Location into what the Year page displays.
import { civilDayNumber } from "./civilTime.ts";
import {
  fill,
  formatDayLengthChange,
  formatDuration,
  type MenuRow,
  type Translate,
  type TranslatePlural,
} from "./presentation.ts";
import { MS_PER_DAY, MS_PER_MINUTE } from "./time.ts";
import type { SolsticeOrEquinox, YearReading } from "./year.ts";

export interface YearPresentationOptions {
  /** IANA time zone in which civil dates are counted and shown. */
  readonly timeZone: string;
  /** BCP 47 locale in which dates are shown. */
  readonly locale: string;
  readonly translate: Translate;
  readonly translatePlural: TranslatePlural;
}

/** A month on the chart: the index of its first date in the year, and its name. */
export interface YearMonth {
  readonly index: number;
  readonly label: string;
}

/** The Year page: a chart of the Day length through the year, and rows below it. */
export interface YearView {
  /** The Day length of each civil date of the year, as a fraction of 24 hours. */
  readonly curve: readonly number[];
  /** The index of today's date in the year, from 0 for 1 January. */
  readonly today: number;
  /** The indices of the dates of the year's Solstices and Equinoxes. */
  readonly solsticesAndEquinoxes: readonly number[];
  readonly months: readonly YearMonth[];
  /** Today's Day length with its trend, then the next Solstice and Equinox, in order. */
  readonly rows: readonly MenuRow[];
}

export function presentYear(reading: YearReading, options: YearPresentationOptions): YearView {
  const { timeZone, locale, translate } = options;
  const firstDay = Date.UTC(reading.year, 0, 1) / MS_PER_DAY;
  const dateIndex = (instant: Date): number => civilDayNumber(instant, timeZone) - firstDay;
  const today = dateIndex(reading.instant);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  return {
    curve: reading.dayLengths.map((length) => length / MS_PER_DAY),
    today,
    solsticesAndEquinoxes: reading.solsticesAndEquinoxes
      .map((event) => dateIndex(event.instant))
      .filter((index) => index >= 0 && index < reading.dayLengths.length),
    months: Array.from({ length: 12 }, (_, month) => {
      const first = new Date(Date.UTC(reading.year, month, 1));
      return { index: first.getTime() / MS_PER_DAY - firstDay, label: monthFormat.format(first) };
    }),
    rows: [
      { label: translate("Day length"), value: todaysDayLength(reading, today, translate) },
      ...nextSolsticeAndEquinox(reading).map((event) => ({
        label: nameOf(event, translate),
        value: describeUpcomingDate(event.instant, reading.instant, options),
      })),
    ],
  };
}

/**
 * Today's Day length as the chart shows it, with its change since the date before: e.g.
 * "10h 43m ↓3m". On 1 January, the date before belongs to another year, so no change is given.
 */
function todaysDayLength(reading: YearReading, today: number, translate: Translate): string {
  const length = reading.dayLengths[today] ?? 0;
  const before = reading.dayLengths[today - 1];
  const change = before === undefined ? "" : formatDayLengthChange(length - before, translate);
  return formatDuration(Math.round(length / MS_PER_MINUTE), translate) + change;
}

/** The next Solstice and the next Equinox after the instant read, the sooner first. */
function nextSolsticeAndEquinox(reading: YearReading): SolsticeOrEquinox[] {
  const next = (kind: SolsticeOrEquinox["kind"]): SolsticeOrEquinox[] =>
    reading.solsticesAndEquinoxes
      .filter((event) => event.kind === kind && event.instant > reading.instant)
      .slice(0, 1);
  return [...next("solstice"), ...next("equinox")].sort(
    (a, b) => a.instant.getTime() - b.instant.getTime(),
  );
}

/**
 * The date of `instant`, and how many days away it is from `now`: e.g. "Monday 21 December,
 * in 65 days".
 */
function describeUpcomingDate(instant: Date, now: Date, options: YearPresentationOptions): string {
  const { locale, timeZone, translate, translatePlural } = options;
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
  const days = civilDayNumber(instant, timeZone) - civilDayNumber(now, timeZone);
  const relative =
    days === 0
      ? translate("today")
      : days === 1
        ? translate("tomorrow")
        : // Translators: how far away a date is, in days; never fewer than 2.
          fill(translatePlural("in {days} day", "in {days} days", days), { days: String(days) });
  // Translators: a date to come, then how far away it is, e.g. "Monday 21 December, in 65 days";
  // {date} follows the locale of dates and times.
  return fill(translate("{date}, {relative}"), { date, relative });
}

/** The name of a Solstice or an Equinox, after its month, so that it holds in both hemispheres. */
function nameOf(event: SolsticeOrEquinox, translate: Translate): string {
  switch (event.month) {
    case 3:
      return translate("March equinox");
    case 6:
      return translate("June solstice");
    case 9:
      return translate("September equinox");
    case 12:
      return translate("December solstice");
  }
}
