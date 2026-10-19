// Solar position after the NOAA Solar Calculator (Meeus, "Astronomical Algorithms").
import { degrees, julianCenturiesSinceJ2000, julianDayOf, radians } from "./astronomy.ts";
import type { Location } from "./location.ts";
import { MINUTES_PER_DAY, MS_PER_DAY, MS_PER_MINUTE } from "./time.ts";

const MINUTES_PER_HALF_DAY = MINUTES_PER_DAY / 2;

/**
 * Geometric altitude of the Sun's centre above the horizon, in degrees, at `epochMs`
 * (milliseconds since the Unix epoch). Refraction is not applied.
 */
export function solarAltitude(location: Location, epochMs: number): number {
  const { declination, equationOfTimeMinutes } = sunAt(epochMs);
  const utcMinutes =
    ((((epochMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_DAY) * MINUTES_PER_DAY;
  const trueSolarTimeMinutes = utcMinutes + equationOfTimeMinutes + 4 * location.longitude;
  const hourAngle = radians(trueSolarTimeMinutes / 4 - 180);

  const latitude = radians(location.latitude);
  const cosZenith =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return 90 - degrees(Math.acos(Math.min(1, Math.max(-1, cosZenith))));
}

/**
 * The instant, in milliseconds since the epoch, of the `index`-th culmination of the Sun at
 * `location`: its upper transit (local solar noon) for an odd index, its lower transit (local
 * solar midnight) for an even one. Between two consecutive culminations the Sun only rises or
 * only sinks, so it crosses the horizon at most once.
 */
export function culmination(location: Location, index: number): number {
  // Local true solar time, counted in minutes from the epoch, is a half-day multiple at each
  // culmination. The equation of time varies slowly, so a few fixed-point steps converge.
  const target = index * MINUTES_PER_HALF_DAY - 4 * location.longitude;
  let epochMs = target * MS_PER_MINUTE;
  for (let step = 0; step < 3; step++) {
    epochMs = (target - sunAt(epochMs).equationOfTimeMinutes) * MS_PER_MINUTE;
  }
  return Math.round(epochMs);
}

/** The index of the last culmination at or before `epochMs` (see `culmination`). */
export function culminationIndexAt(location: Location, epochMs: number): number {
  const solarMinutes =
    epochMs / MS_PER_MINUTE + sunAt(epochMs).equationOfTimeMinutes + 4 * location.longitude;
  let index = Math.floor(solarMinutes / MINUTES_PER_HALF_DAY);
  // Settle rounding at the boundaries against the culminations as actually computed.
  while (culmination(location, index) > epochMs) index--;
  while (culmination(location, index + 1) <= epochMs) index++;
  return index;
}

function sunAt(epochMs: number): { declination: number; equationOfTimeMinutes: number } {
  const t = julianCenturiesSinceJ2000(julianDayOf(epochMs));

  const meanLongitude = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const m = radians(meanAnomaly);
  const equationOfCentre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLongitude = meanLongitude + equationOfCentre;
  const omega = radians(125.04 - 1934.136 * t);
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega);

  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = radians(meanObliquity + 0.00256 * Math.cos(omega));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(radians(apparentLongitude)));

  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = radians(meanLongitude);
  const equationOfTimeMinutes =
    4 *
    degrees(
      y * Math.sin(2 * l0) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
        0.5 * y * y * Math.sin(4 * l0) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m),
    );

  return { declination, equationOfTimeMinutes };
}
