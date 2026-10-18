import { describe, expect, test } from "vitest";
import {
  type ClockSnapshot,
  type MenuRow,
  type PhaseKind,
  type PresentationOptions,
  present,
  presentError,
  presentLocationUnknown,
} from "./index.ts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const PARIS = { name: "Paris", latitude: 48.8566, longitude: 2.3522 };

const OPTIONS: PresentationOptions = {
  reading: "remaining",
  barContent: "arc-and-duration",
  timeZone: "Europe/Paris",
  locale: "en-GB",
  translate: (message) => message,
  location: { ...PARIS, source: "manual" },
};

function snapshotOf(
  kind: PhaseKind,
  phase: { start: string; end: string },
  instant: string | number,
  lastDayLength = 16 * HOUR,
  previousDayLength: number | null = null,
): ClockSnapshot {
  const start = Date.parse(phase.start);
  const end = Date.parse(phase.end);
  const now = typeof instant === "number" ? instant : Date.parse(instant);
  return {
    instant: new Date(now),
    phase: { kind, start: new Date(start), end: new Date(end), isPolar: end - start > 24 * HOUR },
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
    lastDayLength,
    previousDayLength,
    dawn: null,
    dusk: null,
  };
}

// A Phase of the given kind from 06:00 to 20:00 UTC, read `remaining` milliseconds before
// its end.
function phaseWithRemaining(kind: PhaseKind, remaining: number): ClockSnapshot {
  const phase = { start: "2026-06-21T06:00:00Z", end: "2026-06-21T20:00:00Z" };
  return snapshotOf(kind, phase, Date.parse(phase.end) - remaining);
}

function dayWithRemaining(remaining: number): ClockSnapshot {
  return phaseWithRemaining("day", remaining);
}

function barText(remaining: number, options: PresentationOptions = OPTIONS): string | null {
  return present(dayWithRemaining(remaining), options).bar.text;
}

// Stands in for gettext with a French catalogue; any message it lacks fails the test.
const FRENCH_CATALOGUE: Readonly<Record<string, string>> = {
  "{hours}h {minutes}m": "{hours} h {minutes}",
  "{minutes} min": "{minutes} min",
  "{minutes}m": "{minutes} min",
  "{seconds}s": "{seconds} s",
  Sunrise: "Lever du soleil",
  Sunset: "Coucher du soleil",
  "yesterday at {time}": "hier à {time}",
  "tomorrow at {time}": "demain à {time}",
  "{date} at {time}": "{date} à {time}",
  "Day length": "Durée du jour",
  "Night length": "Durée de la nuit",
  Dawn: "Aube",
  Dusk: "Crépuscule",
  "Remaining time": "Temps restant",
  "Elapsed time": "Temps écoulé",
  "Manual location": "Lieu manuel",
  "Automatic location": "Lieu automatique",
  "{degrees}° N": "{degrees}° N",
  "{degrees}° S": "{degrees}° S",
  "{degrees}° E": "{degrees}° E",
  "{degrees}° W": "{degrees}° O",
  "Polar day": "Jour polaire",
  "Polar night": "Nuit polaire",
  "{days}d {hours}h": "{days} j {hours} h",
  "Location unknown": "Lieu inconnu",
  "Set a location manually…": "Définir un lieu manuellement…",
  Error: "Erreur",
};
const FRENCH: PresentationOptions = {
  ...OPTIONS,
  locale: "fr-FR",
  translate: (message) => {
    const translation = FRENCH_CATALOGUE[message];
    if (translation === undefined) throw new Error(`No French translation for "${message}"`);
    return translation;
  },
};

describe("present: Remaining time in the bar", () => {
  test("shows hours and minutes over one hour", () => {
    expect(barText(3 * HOUR + 15 * MINUTE)).toBe("3h 15m");
  });

  test("rounds up to the minute, so the event never seems to arrive early", () => {
    expect(barText(3 * HOUR + 14 * MINUTE + 1)).toBe("3h 15m");
    expect(barText(3 * HOUR + 14 * MINUTE + 59 * SECOND)).toBe("3h 15m");
  });

  test('never shows "0 min" in the last minute before the Solar event', () => {
    expect(barText(1)).toBe("1 min");
    expect(barText(MINUTE)).toBe("1 min");
    expect(barText(MINUTE + 1)).toBe("2 min");
  });

  test("shows minutes only under one hour", () => {
    expect(barText(42 * MINUTE)).toBe("42 min");
    expect(barText(59 * MINUTE)).toBe("59 min");
  });

  test("switches to hours once rounding reaches one hour", () => {
    expect(barText(59 * MINUTE + 1)).toBe("1h 00m");
    expect(barText(HOUR)).toBe("1h 00m");
    expect(barText(2 * HOUR + 5 * MINUTE)).toBe("2h 05m");
  });
});

describe("present: Elapsed time in the bar", () => {
  const ELAPSED: PresentationOptions = { ...OPTIONS, reading: "elapsed" };
  const PHASE_LENGTH = 14 * HOUR;

  function elapsedText(elapsed: number): string | null {
    return present(dayWithRemaining(PHASE_LENGTH - elapsed), ELAPSED).bar.text;
  }

  test("rounds down to the minute, so it never claims more time has passed", () => {
    expect(elapsedText(3 * HOUR + 15 * MINUTE + 59 * SECOND)).toBe("3h 15m");
    expect(elapsedText(42 * MINUTE + 59 * SECOND)).toBe("42 min");
  });

  test("shows minutes only under one hour, and hours once a full hour has passed", () => {
    expect(elapsedText(59 * MINUTE + 59 * SECOND)).toBe("59 min");
    expect(elapsedText(HOUR)).toBe("1h 00m");
  });

  test('shows "0 min" in the first minute of the Phase', () => {
    expect(elapsedText(0)).toBe("0 min");
    expect(elapsedText(59 * SECOND)).toBe("0 min");
  });
});

describe("present: French", () => {
  test("writes durations the French way", () => {
    expect(barText(3 * HOUR + 15 * MINUTE, FRENCH)).toBe("3 h 15");
    expect(barText(3 * HOUR + 5 * MINUTE, FRENCH)).toBe("3 h 05");
    expect(barText(42 * MINUTE, FRENCH)).toBe("42 min");
  });
});

describe("present: Sun arc", () => {
  test("puts the Sun on the arc during a Day, at the Progress of the Phase", () => {
    const { arc } = present(phaseWithRemaining("day", 3.5 * HOUR), OPTIONS).bar;

    expect(arc).toEqual({ body: "sun", progress: 0.75, emphasis: "ahead" });
  });

  test("puts the Moon on the arc during a Night", () => {
    const { arc } = present(phaseWithRemaining("night", 7 * HOUR), OPTIONS).bar;

    expect(arc).toEqual({ body: "moon", progress: 0.5, emphasis: "ahead" });
  });

  test("covers the whole Phase, from its very start to just before its end", () => {
    expect(present(phaseWithRemaining("day", 14 * HOUR), OPTIONS).bar.arc?.progress).toBe(0);
    expect(present(phaseWithRemaining("day", 1), OPTIONS).bar.arc?.progress).toBeCloseTo(1, 6);
  });

  test("emphasises the part of the arc the Reading measures", () => {
    const snapshot = phaseWithRemaining("day", 3.5 * HOUR);

    // Remaining time: the way still ahead of the Sun.
    expect(present(snapshot, OPTIONS).bar.arc?.emphasis).toBe("ahead");
    // Elapsed time: the way already behind it.
    expect(present(snapshot, { ...OPTIONS, reading: "elapsed" }).bar.arc?.emphasis).toBe("behind");
  });
});

describe("present: what the bar shows", () => {
  test("shows the Sun arc alone, with no text, when the user chose the arc only", () => {
    const bar = present(dayWithRemaining(3 * HOUR), { ...OPTIONS, barContent: "arc" }).bar;

    expect(bar).toEqual({
      arc: { body: "sun", progress: 11 / 14, emphasis: "ahead" },
      text: null,
    });
  });

  test("shows the duration alone, with no Sun arc, when the user chose the duration only", () => {
    const bar = present(dayWithRemaining(3 * HOUR), { ...OPTIONS, barContent: "duration" }).bar;

    expect(bar).toEqual({ arc: null, text: "3h 00m" });
  });
});

describe("present: Phase menu", () => {
  // A Night in Paris (CEST, UTC+2) from Sunset at 21:58 to Sunrise at 05:47 the next morning.
  const NIGHT = { start: "2026-06-21T19:58:00Z", end: "2026-06-22T03:47:00Z" };

  function rows(snapshot: ClockSnapshot, options: PresentationOptions = OPTIONS): MenuRow[] {
    return [...present(snapshot, options).menu.rows];
  }

  test("at 23:00, follows the current Night rather than the civil day", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z", 16 * HOUR + 11 * MINUTE);

    expect(rows(snapshot)).toEqual([
      { label: "Sunset", value: "21:58" },
      { label: "Sunrise", value: "tomorrow at 05:47" },
      { label: "Night length", value: "7h 49m" },
      { label: "Elapsed time", value: "1h 02m" },
      { label: "Day length", value: "16h 11m" },
      { label: "Manual location", value: "Paris" },
    ]);
  });

  test("frames the Phase with Dawn and Dusk, in the order they happen", () => {
    const night = {
      ...snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z"),
      dusk: new Date("2026-06-21T20:41:00Z"),
      dawn: new Date("2026-06-22T03:04:00Z"),
    };
    const DAY = { start: "2026-06-21T03:47:00Z", end: "2026-06-21T19:58:00Z" };
    const day = {
      ...snapshotOf("day", DAY, "2026-06-21T12:00:00Z"),
      dawn: new Date("2026-06-21T03:04:00Z"),
      dusk: new Date("2026-06-21T20:41:00Z"),
    };

    expect(rows(night).slice(0, 4)).toEqual([
      { label: "Sunset", value: "21:58" },
      { label: "Dusk", value: "22:41" },
      { label: "Dawn", value: "tomorrow at 05:04" },
      { label: "Sunrise", value: "tomorrow at 05:47" },
    ]);
    expect(rows(day).slice(0, 4)).toEqual([
      { label: "Dawn", value: "05:04" },
      { label: "Sunrise", value: "05:47" },
      { label: "Sunset", value: "21:58" },
      { label: "Dusk", value: "22:41" },
    ]);
  });

  test("leaves out a Dawn or Dusk that does not happen", () => {
    const snapshot = {
      ...snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z"),
      dusk: new Date("2026-06-21T20:41:00Z"),
    };

    expect(rows(snapshot).slice(0, 3)).toEqual([
      { label: "Sunset", value: "21:58" },
      { label: "Dusk", value: "22:41" },
      { label: "Sunrise", value: "tomorrow at 05:47" },
    ]);
  });

  test('after midnight, marks the Sunset "yesterday"', () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T23:00:00Z");

    expect(rows(snapshot).slice(0, 2)).toEqual([
      { label: "Sunset", value: "yesterday at 21:58" },
      { label: "Sunrise", value: "05:47" },
    ]);
  });

  test("dates a Solar event further away than yesterday or tomorrow", () => {
    const longNight = { start: "2026-06-18T19:58:00Z", end: "2026-06-24T03:47:00Z" };
    const snapshot = snapshotOf("night", longNight, "2026-06-21T12:00:00Z");

    expect(rows(snapshot).slice(0, 2)).toEqual([
      { label: "Sunset", value: "Thu 18 Jun at 21:58" },
      { label: "Sunrise", value: "Wed 24 Jun at 05:47" },
    ]);
  });

  test("shows whichever duration the bar does not", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z");
    const view = present(snapshot, { ...OPTIONS, reading: "elapsed" });

    expect(view.bar.text).toBe("1h 02m");
    expect(view.menu.rows).toContainEqual({ label: "Remaining time", value: "6h 47m" });
  });

  test("during a Day, the Phase length is the Day length, shown once", () => {
    const day = { start: "2026-06-21T03:47:00Z", end: "2026-06-21T19:58:00Z" };
    const snapshot = snapshotOf("day", day, "2026-06-21T12:00:00Z", 16 * HOUR + 11 * MINUTE);

    expect(rows(snapshot)).toEqual([
      { label: "Sunrise", value: "05:47" },
      { label: "Sunset", value: "21:58" },
      { label: "Day length", value: "16h 11m" },
      { label: "Elapsed time", value: "8h 13m" },
      { label: "Manual location", value: "Paris" },
    ]);
  });

  test("describes an unnamed Location by its coordinates, and says where it comes from", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z");
    const quito = {
      name: null,
      latitude: -0.1807,
      longitude: -78.4678,
      source: "automatic",
    } as const;

    expect(rows(snapshot, { ...OPTIONS, location: quito }).at(-1)).toEqual({
      label: "Automatic location",
      value: "0.181° S, 78.468° W",
    });
  });

  test("says when it falls back on the Last known location", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z");
    const location = { ...PARIS, source: "last-known" } as const;

    expect(rows(snapshot, { ...OPTIONS, location }).at(-1)).toEqual({
      label: "Last known location",
      value: "Paris",
    });
  });

  test("speaks French", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z", 16 * HOUR + 11 * MINUTE);
    const quito = { name: null, latitude: -0.1807, longitude: -78.4678, source: "manual" } as const;

    expect(rows(snapshot, { ...FRENCH, location: quito })).toEqual([
      { label: "Coucher du soleil", value: "21:58" },
      { label: "Lever du soleil", value: "demain à 05:47" },
      { label: "Durée de la nuit", value: "7 h 49" },
      { label: "Temps écoulé", value: "1 h 02" },
      { label: "Durée du jour", value: "16 h 11" },
      { label: "Lieu manuel", value: "0,181° S, 78,468° O" },
    ]);
  });

  test("keeps the language of the messages when dates and times follow another locale", () => {
    const snapshot = snapshotOf("night", NIGHT, "2026-06-21T21:00:00Z");

    expect(rows(snapshot, { ...OPTIONS, locale: "fr-FR" })[1]).toEqual({
      label: "Sunrise",
      value: "tomorrow at 05:47",
    });
    expect(rows(snapshot, { ...FRENCH, locale: "en-GB" })[1]).toEqual({
      label: "Lever du soleil",
      value: "demain à 05:47",
    });
  });
});

describe("present: Day length trend", () => {
  // A Day in Paris (CEST) from Sunrise at 05:47 to Sunset at 21:58: 16 h 11.
  const DAY = { start: "2026-06-21T03:47:00Z", end: "2026-06-21T19:58:00Z" };
  const DAY_LENGTH = 16 * HOUR + 11 * MINUTE;

  function dayLengthValue(previousDayLength: number | null, options = OPTIONS) {
    const snapshot = snapshotOf("day", DAY, "2026-06-21T12:00:00Z", DAY_LENGTH, previousDayLength);
    return present(snapshot, options).menu.rows.find(
      (row) => row.label === options.translate("Day length"),
    )?.value;
  }

  test("marks a Day longer than the Day before, by the minute", () => {
    expect(dayLengthValue(DAY_LENGTH - 3 * MINUTE - 12 * SECOND)).toBe("16h 11m ↑3m");
  });

  test("marks a Day shorter than the Day before", () => {
    expect(dayLengthValue(DAY_LENGTH + 2 * MINUTE + 40 * SECOND)).toBe("16h 11m ↓3m");
  });

  test("gives a change under a minute in seconds, as near a solstice", () => {
    expect(dayLengthValue(DAY_LENGTH - 45 * SECOND)).toBe("16h 11m ↑45s");
  });

  test("leaves the trend out when the change rounds to no second", () => {
    expect(dayLengthValue(DAY_LENGTH - 400)).toBe("16h 11m");
  });

  test("leaves the trend out when the Day before is not known", () => {
    expect(dayLengthValue(null)).toBe("16h 11m");
  });

  test("during a Night, follows the length of the Day that just ended", () => {
    const night = { start: "2026-06-21T19:58:00Z", end: "2026-06-22T03:47:00Z" };
    const snapshot = snapshotOf(
      "night",
      night,
      "2026-06-21T21:00:00Z",
      DAY_LENGTH,
      DAY_LENGTH + 5 * SECOND,
    );

    expect(present(snapshot, OPTIONS).menu.rows.slice(2, 5)).toEqual([
      { label: "Night length", value: "7h 49m" },
      { label: "Elapsed time", value: "1h 02m" },
      { label: "Day length", value: "16h 11m ↓5s" },
    ]);
  });

  test("speaks French", () => {
    expect(dayLengthValue(DAY_LENGTH - 3 * MINUTE, FRENCH)).toBe("16 h 11 ↑3 min");
    expect(dayLengthValue(DAY_LENGTH + 45 * SECOND, FRENCH)).toBe("16 h 11 ↓45 s");
  });
});

describe("present: Polar day and Polar night", () => {
  const DAY = 24 * HOUR;
  // A Polar day in Tromsø, from 17 May to 25 July.
  const POLAR_DAY = { start: "2026-05-17T22:53:00Z", end: "2026-07-25T22:36:00Z" };

  function polarDayRemaining(remaining: number, options = OPTIONS) {
    return present(snapshotOf("day", POLAR_DAY, Date.parse(POLAR_DAY.end) - remaining), options);
  }

  function polarDayElapsed(elapsed: number) {
    const snapshot = snapshotOf("day", POLAR_DAY, Date.parse(POLAR_DAY.start) + elapsed);
    return present(snapshot, { ...OPTIONS, reading: "elapsed" });
  }

  test("shows the polar state while the Remaining time exceeds 24 hours", () => {
    expect(polarDayRemaining(DAY + 1).bar.text).toBe("Polar day");
    expect(polarDayRemaining(30 * DAY).bar.text).toBe("Polar day");
  });

  test("shows the Remaining time again from 24 hours before the Solar event", () => {
    expect(polarDayRemaining(DAY).bar.text).toBe("24h 00m");
    expect(polarDayRemaining(DAY - 1).bar.text).toBe("24h 00m");
  });

  test("applies the same threshold to the Elapsed time", () => {
    expect(polarDayElapsed(DAY + 59 * SECOND).bar.text).toBe("24h 00m");
    expect(polarDayElapsed(DAY + MINUTE).bar.text).toBe("Polar day");
  });

  test("names a Polar night as such", () => {
    const polarNight = { start: "2026-11-27T10:42:00Z", end: "2027-01-15T10:35:00Z" };
    const snapshot = snapshotOf("night", polarNight, "2026-12-21T12:00:00Z");

    expect(present(snapshot, OPTIONS).bar.text).toBe("Polar night");
    expect(present(snapshot, FRENCH).bar.text).toBe("Nuit polaire");
  });

  test("shows only the part of the bar the user chose", () => {
    const arcOnly = polarDayRemaining(30 * DAY, { ...OPTIONS, barContent: "arc" }).bar;
    const durationOnly = polarDayRemaining(30 * DAY, { ...OPTIONS, barContent: "duration" }).bar;

    expect(arcOnly.text).toBeNull();
    expect(arcOnly.arc?.body).toBe("sun");
    expect(durationOnly).toEqual({ arc: null, text: "Polar day" });
  });

  test("keeps the Sun arc at the Progress of the long Phase", () => {
    const halfway = (Date.parse(POLAR_DAY.end) - Date.parse(POLAR_DAY.start)) / 2;

    expect(polarDayRemaining(halfway).bar.arc).toEqual({
      body: "sun",
      progress: 0.5,
      emphasis: "ahead",
    });
  });

  test("dates the next Solar event and gives long durations in days and hours", () => {
    const rows = polarDayRemaining(30 * DAY + 2 * HOUR).menu.rows;

    expect(rows.slice(0, 4)).toEqual([
      { label: "Sunrise", value: "Mon 18 May at 00:53" },
      { label: "Sunset", value: "Sun 26 Jul at 00:36" },
      { label: "Day length", value: "68d 23h" },
      { label: "Elapsed time", value: "38d 21h" },
    ]);
  });

  test("gives long durations the French way", () => {
    const rows = polarDayRemaining(30 * DAY + 2 * HOUR, FRENCH).menu.rows;

    expect(rows[2]).toEqual({ label: "Durée du jour", value: "68 j 23 h" });
  });
});

describe("present: Location unknown", () => {
  test("shows the state in the bar, with no Sun arc", () => {
    expect(presentLocationUnknown(OPTIONS.translate).bar).toEqual({
      arc: null,
      text: "Location unknown",
    });
  });

  test("offers to set a Location manually in the menu, instead of the Phase details", () => {
    expect(presentLocationUnknown(OPTIONS.translate).menu).toEqual({
      rows: [],
      manualLocationEntry: "Set a location manually…",
    });
  });

  test("speaks French", () => {
    const view = presentLocationUnknown(FRENCH.translate);

    expect(view.bar.text).toBe("Lieu inconnu");
    expect(view.menu.manualLocationEntry).toBe("Définir un lieu manuellement…");
  });
});

describe("present: Error", () => {
  test("replaces the Reading and the Phase details with the error state", () => {
    expect(presentError(OPTIONS.translate)).toEqual({
      bar: { arc: null, text: "Error" },
      menu: { rows: [], manualLocationEntry: null },
    });
  });

  test("speaks French", () => {
    expect(presentError(FRENCH.translate).bar.text).toBe("Erreur");
  });
});
