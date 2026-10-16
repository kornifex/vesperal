// Typed access to the extension's GSettings keys, shared by the extension and its preferences.

import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { type Location, type LocationInUse, READINGS, type Reading } from "@sun-clock/core";

/** Every location mode the user can choose, the default first. */
export const LOCATION_MODES = ["automatic", "manual"] as const;

/** Where the Location comes from, unless it falls back on the Last known location. */
export type LocationMode = (typeof LOCATION_MODES)[number];

/** A Location as stored in the settings, with its place name if one is known. */
export interface StoredLocation extends Location {
  readonly name: string | null;
}

export function readReading(settings: Gio.Settings): Reading {
  const nick = settings.get_string("reading");
  return READINGS.find((reading) => reading === nick) ?? READINGS[0];
}

export function writeReading(settings: Gio.Settings, reading: Reading): void {
  settings.set_string("reading", reading);
}

export function readLocationMode(settings: Gio.Settings): LocationMode {
  const nick = settings.get_string("location-mode");
  return LOCATION_MODES.find((mode) => mode === nick) ?? LOCATION_MODES[0];
}

export function writeLocationMode(settings: Gio.Settings, mode: LocationMode): void {
  settings.set_string("location-mode", mode);
}

export function readManualLocation(settings: Gio.Settings): LocationInUse | null {
  const location = readStoredLocation(settings, "manual-location");
  return location && { ...location, source: "manual" };
}

export function writeManualLocation(settings: Gio.Settings, location: StoredLocation): void {
  writeStoredLocation(settings, "manual-location", location);
}

export function readLastKnownLocation(settings: Gio.Settings): StoredLocation | null {
  return readStoredLocation(settings, "last-known-location");
}

/** Remembers `location` as the Last known location, writing only when it has changed. */
export function writeLastKnownLocation(settings: Gio.Settings, location: StoredLocation): void {
  const lastKnown = readLastKnownLocation(settings);
  if (
    lastKnown?.name !== location.name ||
    lastKnown.latitude !== location.latitude ||
    lastKnown.longitude !== location.longitude
  ) {
    writeStoredLocation(settings, "last-known-location", location);
  }
}

function readStoredLocation(settings: Gio.Settings, key: string): StoredLocation | null {
  const value = settings.get_value(key).get_maybe();
  if (!value) return null;
  const [name, latitude, longitude] = value.deepUnpack() as [string, number, number];
  // The key can be set from the command line, bypassing the checks of the preferences.
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return null;
  return { name: name || null, latitude, longitude };
}

function writeStoredLocation(settings: Gio.Settings, key: string, location: StoredLocation): void {
  settings.set_value(
    key,
    new GLib.Variant("m(sdd)", [location.name ?? "", location.latitude, location.longitude]),
  );
}
