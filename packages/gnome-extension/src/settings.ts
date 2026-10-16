// Typed access to the extension's GSettings keys, shared by the extension and its preferences.

import type Gio from "gi://Gio";
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
  return { name: name || null, latitude, longitude, source: "manual" };
}
