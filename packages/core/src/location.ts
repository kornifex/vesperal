/** Geographic coordinates in degrees: latitude north-positive, longitude east-positive. */
export interface Location {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Where the Location in use comes from: the active mode, or the Last known location when that
 * mode has none.
 */
export type LocationSource = "automatic" | "manual" | "last-known";

/** The Location the clock is read for, as the menu describes it. */
export interface LocationInUse extends Location {
  /** A place name, if one is known; the coordinates describe the Location otherwise. */
  readonly name: string | null;
  readonly source: LocationSource;
}
