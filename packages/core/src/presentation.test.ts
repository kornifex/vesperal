import { describe, expect, test } from "vitest";
import { type ClockSnapshot, type PresentationOptions, present } from "./index.ts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const OPTIONS: PresentationOptions = {
  reading: "remaining",
  timeZone: "Europe/Paris",
  locale: "en",
  translate: (message) => message,
};

// A Day from 06:00 to 20:00 UTC, read `remaining` milliseconds before Sunset.
function dayWithRemaining(remaining: number): ClockSnapshot {
  const start = Date.parse("2026-06-21T06:00:00Z");
  const end = Date.parse("2026-06-21T20:00:00Z");
  return {
    phase: { kind: "day", start: new Date(start), end: new Date(end) },
    remaining,
    elapsed: end - start - remaining,
    progress: (end - start - remaining) / (end - start),
  };
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

describe("present: French", () => {
  test("writes durations the French way", () => {
    expect(barText(3 * HOUR + 15 * MINUTE, FRENCH)).toBe("3 h 15");
    expect(barText(3 * HOUR + 5 * MINUTE, FRENCH)).toBe("3 h 05");
    expect(barText(42 * MINUTE, FRENCH)).toBe("42 min");
  });
});
