// The Moon phase, after Meeus, "Astronomical Algorithms", chapters 47 and 48.
import { julianCenturiesSinceJ2000, julianDayOf, radians } from "./astronomy.ts";

const sin = (degrees: number): number => Math.sin(radians(degrees));

/** How much of the Moon is lit, and whether that is growing. */
export interface MoonPhase {
  /** The illuminated fraction of the Moon's disc, from 0 (New Moon) to 1 (Full Moon). */
  readonly illuminated: number;
  /** Whether the lit part is growing, from New Moon to Full Moon. */
  readonly waxing: boolean;
}

/**
 * The Moon phase at an instant, as seen from the centre of the Earth. Meeus's short series is
 * good to a few thousandths of the disc, and to well within an hour on the moments of New and
 * Full Moon.
 */
export function moonPhase(instant: Date): MoonPhase {
  const t = julianCenturiesSinceJ2000(julianDayOf(instant.getTime()));

  // Mean elongation of the Moon, mean anomaly of the Sun and of the Moon (Meeus 47.2 to 47.4).
  const d =
    297.8501921 + t * (445267.1114034 + t * (-0.0018819 + t * (1 / 545868 - t / 113065000)));
  const m = 357.5291092 + t * (35999.0502909 + t * (-0.0001536 + t / 24490000));
  const mPrime =
    134.9633964 + t * (477198.8675055 + t * (0.0087414 + t * (1 / 69699 - t / 14712000)));

  // The phase angle, Sun–Moon–Earth (Meeus 48.4), and the illuminated fraction (48.1).
  const phaseAngle =
    180 -
    d -
    6.289 * sin(mPrime) +
    2.1 * sin(m) -
    1.274 * sin(2 * d - mPrime) -
    0.658 * sin(2 * d) -
    0.214 * sin(2 * mPrime) -
    0.11 * sin(d);
  // The elongation grows from 0° at New Moon to 180° at Full Moon, then on to 360°.
  const elongation = (((180 - phaseAngle) % 360) + 360) % 360;
  return {
    illuminated: (1 + Math.cos(radians(phaseAngle))) / 2,
    waxing: elongation < 180,
  };
}
