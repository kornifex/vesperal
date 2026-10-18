import { describe, expect, test } from "vitest";
import { startOfCivilDay } from "./civilTime.ts";

const dayNumber = (date: string): number => Date.parse(date) / 86_400_000;

describe("startOfCivilDay", () => {
  test("begins a date at local midnight, on either side of a daylight-saving change", () => {
    // Paris: summer time begins on 29 March 2026 and ends on 25 October 2026.
    expect(new Date(startOfCivilDay(dayNumber("2026-03-29"), "Europe/Paris")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(new Date(startOfCivilDay(dayNumber("2026-03-30"), "Europe/Paris")).toISOString()).toBe(
      "2026-03-29T22:00:00.000Z",
    );
    expect(new Date(startOfCivilDay(dayNumber("2026-10-25"), "Europe/Paris")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });

  test("begins a date when the clocks jump, where they spring forward at midnight", () => {
    // Santiago: on 6 September 2026 the clocks go from 00:00 to 01:00, from UTC−4 to UTC−3.
    expect(
      new Date(startOfCivilDay(dayNumber("2026-09-06"), "America/Santiago")).toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });
});
