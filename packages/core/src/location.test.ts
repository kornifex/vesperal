import { describe, expect, test } from "vitest";
import { isValidLocation, resolveLocation } from "./index.ts";

const PARIS = { name: "Paris", latitude: 48.8566, longitude: 2.3522 };
const QUITO = { name: null, latitude: -0.1807, longitude: -78.4678 };

describe("resolveLocation", () => {
  test("uses the Location from the active mode, saying which mode it is", () => {
    expect(resolveLocation("automatic", PARIS, QUITO)).toEqual({ ...PARIS, source: "automatic" });
    expect(resolveLocation("manual", PARIS, QUITO)).toEqual({ ...PARIS, source: "manual" });
  });

  test("falls back on the Last known location when the mode has none", () => {
    expect(resolveLocation("automatic", null, QUITO)).toEqual({ ...QUITO, source: "last-known" });
  });

  test("leaves the Location unknown when there is no Last known location either", () => {
    expect(resolveLocation("manual", null, null)).toBeNull();
  });
});

describe("isValidLocation", () => {
  test("accepts any point on Earth, poles and date line included", () => {
    expect(isValidLocation({ latitude: 90, longitude: -180 })).toBe(true);
    expect(isValidLocation({ latitude: -90, longitude: 180 })).toBe(true);
  });

  test("rejects coordinates out of range or not numbers", () => {
    expect(isValidLocation({ latitude: 90.1, longitude: 0 })).toBe(false);
    expect(isValidLocation({ latitude: 0, longitude: -180.1 })).toBe(false);
    expect(isValidLocation({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });
});
