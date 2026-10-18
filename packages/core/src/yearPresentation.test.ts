import { describe, expect, test } from "vitest";
import {
  presentYear,
  type SolsticeOrEquinox,
  type YearPresentationOptions,
  type YearReading,
} from "./index.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// USNO: the Solstices and Equinoxes of 2026 and 2027, in UTC.
const SOLSTICES_AND_EQUINOXES: readonly SolsticeOrEquinox[] = [
  { kind: "equinox", month: 3, instant: new Date("2026-03-20T14:46Z") },
  { kind: "solstice", month: 6, instant: new Date("2026-06-21T08:24Z") },
  { kind: "equinox", month: 9, instant: new Date("2026-09-23T00:05Z") },
  { kind: "solstice", month: 12, instant: new Date("2026-12-21T20:50Z") },
  { kind: "equinox", month: 3, instant: new Date("2027-03-20T20:25Z") },
  { kind: "solstice", month: 6, instant: new Date("2027-06-21T14:11Z") },
  { kind: "equinox", month: 9, instant: new Date("2027-09-23T06:02Z") },
  { kind: "solstice", month: 12, instant: new Date("2027-12-22T02:42Z") },
];
// A made-up year whose dates grow by a minute each, from 8 hours on 1 January.
const DAY_LENGTHS = Array.from({ length: 365 }, (_, index) => 8 * HOUR + index * MINUTE);

const OPTIONS: YearPresentationOptions = {
  timeZone: "Europe/Paris",
  locale: "en-GB",
  translate: (message) => message,
  translatePlural: (singular, plural, count) => (count === 1 ? singular : plural),
};

// Stands in for gettext with a French catalogue; any message it lacks fails the test.
const FRENCH_CATALOGUE: Readonly<Record<string, string>> = {
  "Day length": "Durée du jour",
  "{hours}h {minutes}m": "{hours} h {minutes}",
  "{minutes} min": "{minutes} min",
  "{minutes}m": "{minutes} min",
  "March equinox": "Équinoxe de mars",
  "December solstice": "Solstice de décembre",
  today: "aujourd’hui",
  tomorrow: "demain",
  "in {days} day": "dans {days} jour",
  "in {days} days": "dans {days} jours",
  "{date}, {relative}": "{date}, {relative}",
};
function translateToFrench(message: string): string {
  const translation = FRENCH_CATALOGUE[message];
  if (translation === undefined) throw new Error(`No French translation for "${message}"`);
  return translation;
}
const FRENCH: YearPresentationOptions = {
  timeZone: "Europe/Paris",
  locale: "fr-FR",
  translate: translateToFrench,
  translatePlural: (singular, plural, count) => translateToFrench(count === 1 ? singular : plural),
};

/** The year 2026 in Paris, read at `instant`. */
function readingAt(instant: string, dayLengths: readonly number[] = DAY_LENGTHS): YearReading {
  return {
    instant: new Date(instant),
    year: 2026,
    dayLengths,
    solsticesAndEquinoxes: SOLSTICES_AND_EQUINOXES,
  };
}

describe("presentYear", () => {
  test("draws the Day length of each date as a fraction of 24 hours, and marks today", () => {
    const view = presentYear(readingAt("2026-10-17T10:00:00Z"), OPTIONS);

    expect(view.curve).toHaveLength(365);
    expect(view.curve[0]).toBe(1 / 3);
    expect(view.curve[240]).toBe(12 / 24);
    // 17 October is the 290th date of the year.
    expect(view.today).toBe(289);
  });

  test("places the year's Solstices and Equinoxes on their dates", () => {
    const view = presentYear(readingAt("2026-10-17T10:00:00Z"), OPTIONS);

    // 20 March, 21 June, 23 September (02:05 in Paris) and 21 December.
    expect(view.solsticesAndEquinoxes).toEqual([78, 171, 265, 354]);
  });

  test("marks the first date of each month", () => {
    const { months } = presentYear(readingAt("2026-10-17T10:00:00Z"), OPTIONS);

    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ index: 0, label: "Jan" });
    expect(months[2]).toEqual({ index: 59, label: "Mar" });
    expect(months[11]).toEqual({ index: 334, label: "Dec" });
  });

  test("gives today's Day length with its trend, then the next Solstice and Equinox", () => {
    const { rows } = presentYear(readingAt("2026-10-17T10:00:00Z"), OPTIONS);

    // 8 h plus 289 minutes, a minute more than the date before.
    expect(rows).toEqual([
      { label: "Day length", value: "12h 49m ↑1m" },
      { label: "December solstice", value: "Monday 21 December, in 65 days" },
      { label: "March equinox", value: "Saturday 20 March, in 154 days" },
    ]);
  });

  test("gives today's Day length as the chart shows it, even during a Polar night", () => {
    const polarNight = presentYear(readingAt("2026-12-21T10:00:00Z", Array(365).fill(0)), OPTIONS);

    expect(polarNight.rows[0]).toEqual({ label: "Day length", value: "0 min" });
  });

  test('says "tomorrow" the day before a Solstice, and "today" on the day', () => {
    const dayBefore = presentYear(readingAt("2026-12-20T12:00:00Z"), OPTIONS);
    const onTheDay = presentYear(readingAt("2026-12-21T10:00:00Z"), OPTIONS);

    expect(dayBefore.rows[1]).toEqual({
      label: "December solstice",
      value: "Monday 21 December, tomorrow",
    });
    expect(onTheDay.rows[1]).toEqual({
      label: "December solstice",
      value: "Monday 21 December, today",
    });
  });

  test("speaks French", () => {
    expect(presentYear(readingAt("2026-10-17T10:00:00Z"), FRENCH).rows).toEqual([
      { label: "Durée du jour", value: "12 h 49 ↑1 min" },
      { label: "Solstice de décembre", value: "lundi 21 décembre, dans 65 jours" },
      { label: "Équinoxe de mars", value: "samedi 20 mars, dans 154 jours" },
    ]);
    expect(presentYear(readingAt("2026-12-20T12:00:00Z"), FRENCH).rows[1]?.value).toBe(
      "lundi 21 décembre, demain",
    );
    expect(presentYear(readingAt("2026-12-21T10:00:00Z"), FRENCH).rows[1]?.value).toBe(
      "lundi 21 décembre, aujourd’hui",
    );
    expect(presentYear(readingAt("2026-10-17T10:00:00Z"), FRENCH).months[0]?.label).toBe("janv.");
  });
});
