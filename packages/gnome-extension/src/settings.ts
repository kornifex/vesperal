// Typed access to the extension's GSettings keys, shared by the extension and its preferences.

import Gio from "gi://Gio";
import GLib from "gi://GLib";
import {
  BAR_CONTENTS,
  type BarContent,
  isValidLocation,
  LOCATION_MODES,
  type LocationInUse,
  type LocationMode,
  type NamedLocation,
  NOTIFIABLE_EVENTS,
  type NotifiableEvent,
  PHASE_BOUNDS,
  type PhaseBounds,
  READINGS,
  type Reading,
  resolveLocation,
  TWILIGHTS,
  type Twilight,
} from "@vesperal/core";

/** Every side of the Reading the Sun arc can sit on, the default first. */
export const SUN_ARC_POSITIONS = ["left", "right"] as const;

/** Which side of the Reading the Sun arc sits on in the top bar. */
export type SunArcPosition = (typeof SUN_ARC_POSITIONS)[number];

export function readReading(settings: Gio.Settings): Reading {
  return readChoice(settings, "reading", READINGS);
}

export function writeReading(settings: Gio.Settings, reading: Reading): void {
  settings.set_string("reading", reading);
}

export function readTwilight(settings: Gio.Settings): Twilight {
  return readChoice(settings, "twilight", TWILIGHTS);
}

export function writeTwilight(settings: Gio.Settings, twilight: Twilight): void {
  settings.set_string("twilight", twilight);
}

export function readPhaseBounds(settings: Gio.Settings): PhaseBounds {
  return readChoice(settings, "phase-bounds", PHASE_BOUNDS);
}

export function writePhaseBounds(settings: Gio.Settings, bounds: PhaseBounds): void {
  settings.set_string("phase-bounds", bounds);
}

export function readSunArcPosition(settings: Gio.Settings): SunArcPosition {
  return readChoice(settings, "sun-arc-position", SUN_ARC_POSITIONS);
}

export function writeSunArcPosition(settings: Gio.Settings, position: SunArcPosition): void {
  settings.set_string("sun-arc-position", position);
}

/** Every place the indicator can sit in the top bar, the default first. */
export const INDICATOR_POSITIONS = ["next-to-clock", "left", "right"] as const;

/**
 * Where the indicator sits in the top bar: just after the clock, at the end of the left side,
 * or at the start of the right side.
 */
export type IndicatorPosition = (typeof INDICATOR_POSITIONS)[number];

export function readBarContent(settings: Gio.Settings): BarContent {
  return readChoice(settings, "bar-content", BAR_CONTENTS);
}

export function writeBarContent(settings: Gio.Settings, content: BarContent): void {
  settings.set_string("bar-content", content);
}

export function readIndicatorPosition(settings: Gio.Settings): IndicatorPosition {
  return readChoice(settings, "indicator-position", INDICATOR_POSITIONS);
}

export function writeIndicatorPosition(settings: Gio.Settings, position: IndicatorPosition): void {
  settings.set_string("indicator-position", position);
}

export function readNotificationsEnabled(settings: Gio.Settings): boolean {
  return settings.get_boolean("notifications");
}

/** The events to notify of, in the order of a day. */
export function readNotifiedEvents(settings: Gio.Settings): NotifiableEvent[] {
  const nicks = settings.get_strv("notification-events");
  return NOTIFIABLE_EVENTS.filter((event) => nicks.includes(event));
}

export function writeNotifiedEvents(
  settings: Gio.Settings,
  events: readonly NotifiableEvent[],
): void {
  settings.set_strv("notification-events", [...events]);
}

/** How many minutes before each event to notify of it. */
export function readNotificationLeadMinutes(settings: Gio.Settings): number {
  return settings.get_int("notification-lead-time");
}

export function readLocationMode(settings: Gio.Settings): LocationMode {
  return readChoice(settings, "location-mode", LOCATION_MODES);
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

/**
 * Calls `follow` now, then whenever the GNOME location services are switched on or off.
 * Returns a function that stops following them.
 */
export function followLocationServices(follow: (enabled: boolean) => void): () => void {
  const locationServices = new Gio.Settings({ schema_id: "org.gnome.system.location" });
  const changedId = locationServices.connect("changed::enabled", () =>
    follow(locationServices.get_boolean("enabled")),
  );
  follow(locationServices.get_boolean("enabled"));
  return () => locationServices.disconnect(changedId);
}

/**
 * The Location in use, as the clock resolves it from the settings and, in Automatic mode, from
 * the `automatic` location the system gave, if any.
 */
export function readLocationInUse(
  settings: Gio.Settings,
  automatic: NamedLocation | null,
): LocationInUse | null {
  const mode = readLocationMode(settings);
  const fromMode = mode === "manual" ? readManualLocation(settings) : automatic;
  return resolveLocation(mode, fromMode, readLastKnownLocation(settings));
}

/** The value of a key holding one of `values`, or the first of them if it holds another. */
function readChoice<T extends string>(
  settings: Gio.Settings,
  key: string,
  values: readonly [T, ...T[]],
): T {
  const nick = settings.get_string(key);
  return values.find((value) => value === nick) ?? values[0];
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
