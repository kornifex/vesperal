import { describe, expect, test } from "vitest";
import { type ClockSnapshot, type PhaseKind, type PresentationOptions, present } from "./index.ts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const OPTIONS: PresentationOptions = {
  reading: "remaining",
  timeZone: "Europe/Paris",
  locale: "en",
  translate: (message) => message,
};

// A Phase of the given kind from 06:00 to 20:00 UTC, read `remaining` milliseconds before
// its end.
function phaseWithRemaining(kind: PhaseKind, remaining: number): ClockSnapshot {
  const start = Date.parse("2026-06-21T06:00:00Z");
  const end = Date.parse("2026-06-21T20:00:00Z");
  return {
    phase: { kind, start: new Date(start), end: new Date(end) },
    remaining,
    elapsed: end - start - remaining,
    progress: (end - start - remaining) / (end - start),
  };
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
