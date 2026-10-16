// Typed access to the extension's GSettings keys, shared by the extension and its preferences.

import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import {
  isValidLocation,
  LOCATION_MODES,
  type LocationMode,
  type NamedLocation,
  READINGS,
  type Reading,
} from "@sun-clock/core";

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

export function readManualLocation(settings: Gio.Settings): NamedLocation | null {
  return readStoredLocation(settings, "manual-location");
}

export function writeManualLocation(settings: Gio.Settings, location: NamedLocation): void {
  writeStoredLocation(settings, "manual-location", location);
}

export function readLastKnownLocation(settings: Gio.Settings): NamedLocation | null {
  return readStoredLocation(settings, "last-known-location");
}

/** Remembers `location` as the Last known location, writing only when it has changed. */
export function writeLastKnownLocation(settings: Gio.Settings, location: NamedLocation): void {
  const lastKnown = readLastKnownLocation(settings);
  if (
    lastKnown?.name !== location.name ||
    lastKnown.latitude !== location.latitude ||
    lastKnown.longitude !== location.longitude
  ) {
    writeStoredLocation(settings, "last-known-location", location);
  }
}

function readStoredLocation(settings: Gio.Settings, key: string): NamedLocation | null {
  const value = settings.get_value(key).get_maybe();
  if (!value) return null;
  const [name, latitude, longitude] = value.deepUnpack() as [string, number, number];
  // The key can be set from the command line, bypassing the checks of the preferences.
  const location = { name: name || null, latitude, longitude };
  return isValidLocation(location) ? location : null;
}

function writeStoredLocation(settings: Gio.Settings, key: string, location: NamedLocation): void {
  settings.set_value(
    key,
    new GLib.Variant("m(sdd)", [location.name ?? "", location.latitude, location.longitude]),
  );
}
