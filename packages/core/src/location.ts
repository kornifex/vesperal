/** Geographic coordinates in degrees: latitude north-positive, longitude east-positive. */
export interface Location {
  readonly latitude: number;
  readonly longitude: number;
}

/** A Location with its place name, if one is known. */
export interface NamedLocation extends Location {
  /** A place name, if one is known; the coordinates describe the Location otherwise. */
  readonly name: string | null;
}

/** Every location mode the user can choose, the default first. */
export const LOCATION_MODES = ["automatic", "manual"] as const;

/** Where the Location comes from, unless it falls back on the Last known location. */
export type LocationMode = (typeof LOCATION_MODES)[number];

/**
 * Where the Location in use comes from: the active mode, or the Last known location when that
 * mode has none.
 */
export type LocationSource = LocationMode | "last-known";

/** The Location the clock is read for, as the menu describes it. */
export interface LocationInUse extends NamedLocation {
  readonly source: LocationSource;
}

/** Whether the coordinates designate a point on Earth. */
export function isValidLocation(location: Location): boolean {
  return Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180;
}

/**
 * The Location in use: the one from the active `mode`, then the Last known location, then none
 * (the Location is unknown).
 */
export function resolveLocation(
  mode: LocationMode,
  fromMode: NamedLocation | null,
  lastKnown: NamedLocation | null,
): LocationInUse | null {
  if (fromMode) return { ...fromMode, source: mode };
  return lastKnown && { ...lastKnown, source: "last-known" };
}
