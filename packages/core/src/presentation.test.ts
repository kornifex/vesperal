import { describe, expect, test } from "vitest";
import {
  type ClockSnapshot,
  type MenuRow,
  type PhaseKind,
  type PresentationOptions,
  present,
} from "./index.ts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const PARIS = { name: "Paris", latitude: 48.8566, longitude: 2.3522 };

const OPTIONS: PresentationOptions = {
  reading: "remaining",
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
): ClockSnapshot {
  const start = Date.parse(phase.start);
  const end = Date.parse(phase.end);
  const now = typeof instant === "number" ? instant : Date.parse(instant);
  return {
    instant: new Date(now),
    phase: { kind, start: new Date(start), end: new Date(end) },
    remaining: end - now,
    elapsed: now - start,
    progress: (now - start) / (end - start),
    lastDayLength,
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

function barText(remaining: number, options: PresentationOptions = OPTIONS): string {
  return present(dayWithRemaining(remaining), options).bar.text;
}

// Stands in for gettext with a French catalogue; any message it lacks fails the test.
const FRENCH_CATALOGUE: Readonly<Record<string, string>> = {
  "{hours}h {minutes}m": "{hours} h {minutes}",
  "{minutes} min": "{minutes} min",
  Sunrise: "Lever du soleil",
  Sunset: "Coucher du soleil",
  "{day} at {time}": "{day} à {time}",
  "Day length": "Durée du jour",
  "Night length": "Durée de la nuit",
  "Remaining time": "Temps restant",
  "Elapsed time": "Temps écoulé",
  "Manual location": "Lieu manuel",
  "Automatic location": "Lieu automatique",
  "{degrees}° N": "{degrees}° N",
  "{degrees}° S": "{degrees}° S",
  "{degrees}° E": "{degrees}° E",
  "{degrees}° W": "{degrees}° O",
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

  function elapsedText(elapsed: number): string {
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

    expect(arc).toEqual({ body: "sun", progress: 0.75 });
  });

  test("puts the Moon on the arc during a Night", () => {
    const { arc } = present(phaseWithRemaining("night", 7 * HOUR), OPTIONS).bar;

    expect(arc).toEqual({ body: "moon", progress: 0.5 });
  });

  test("covers the whole Phase, from its very start to just before its end", () => {
    expect(present(phaseWithRemaining("day", 14 * HOUR), OPTIONS).bar.arc.progress).toBe(0);
    expect(present(phaseWithRemaining("day", 1), OPTIONS).bar.arc.progress).toBeCloseTo(1, 6);
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
});
