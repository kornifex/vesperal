// Angles and Julian days, shared by the computations of the Sun and the Moon.
import { MS_PER_DAY } from "./time.ts";

const UNIX_EPOCH_JULIAN_DAY = 2_440_587.5;
const J2000_JULIAN_DAY = 2_451_545;
const DAYS_PER_JULIAN_CENTURY = 36_525;

export const radians = (angle: number): number => (angle * Math.PI) / 180;
export const degrees = (angle: number): number => (angle * 180) / Math.PI;

/** The Julian day of an instant given in milliseconds since the Unix epoch. */
export function julianDayOf(epochMs: number): number {
  return epochMs / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY;
}

/** The instant of a Julian day, in milliseconds since the Unix epoch. */
export function epochMsOf(julianDay: number): number {
  return (julianDay - UNIX_EPOCH_JULIAN_DAY) * MS_PER_DAY;
}

/** Julian centuries since J2000.0, the time variable of Meeus's formulas. */
export function julianCenturiesSinceJ2000(julianDay: number): number {
  return (julianDay - J2000_JULIAN_DAY) / DAYS_PER_JULIAN_CENTURY;
}
