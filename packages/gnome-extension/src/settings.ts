// Typed access to the extension's GSettings keys, shared by the extension and its preferences.

import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { type LocationInUse, READINGS, type Reading } from "@sun-clock/core";

export function readReading(settings: Gio.Settings): Reading {
  const nick = settings.get_string("reading");
  return READINGS.find((reading) => reading === nick) ?? READINGS[0];
}

export function writeReading(settings: Gio.Settings, reading: Reading): void {
  settings.set_string("reading", reading);
}

export function readManualLocation(settings: Gio.Settings): LocationInUse | null {
  const value = settings.get_value("manual-location").get_maybe();
  if (!value) return null;
  const [name, latitude, longitude] = value.deepUnpack() as [string, number, number];
  // The key can be set from the command line, bypassing the checks of the preferences.
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) return null;
  return { name: name || null, latitude, longitude, source: "manual" };
}

export function writeManualLocation(
  settings: Gio.Settings,
  location: { name: string | null; latitude: number; longitude: number },
): void {
  settings.set_value(
    "manual-location",
    new GLib.Variant("m(sdd)", [location.name ?? "", location.latitude, location.longitude]),
  );
}
