// Solar position after the NOAA Solar Calculator (Meeus, "Astronomical Algorithms").
import type { Location } from "./location.ts";

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JULIAN_DAY = 2_440_587.5;
const J2000_JULIAN_DAY = 2_451_545;
const DAYS_PER_JULIAN_CENTURY = 36_525;

const radians = (angle: number): number => (angle * Math.PI) / 180;
const degrees = (angle: number): number => (angle * 180) / Math.PI;

/**
 * Geometric altitude of the Sun's centre above the horizon, in degrees, at `epochMs`
 * (milliseconds since the Unix epoch). Refraction is not applied.
 */
export function solarAltitude(location: Location, epochMs: number): number {
  const julianDay = epochMs / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY;
  const t = (julianDay - J2000_JULIAN_DAY) / DAYS_PER_JULIAN_CENTURY;

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

  const utcMinutes = ((((epochMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_DAY) * 1440;
  const trueSolarTimeMinutes = utcMinutes + equationOfTimeMinutes + 4 * location.longitude;
  const hourAngle = radians(trueSolarTimeMinutes / 4 - 180);

  const latitude = radians(location.latitude);
  const cosZenith =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return 90 - degrees(Math.acos(Math.min(1, Math.max(-1, cosZenith))));
}
