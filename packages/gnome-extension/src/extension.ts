import type Gio from "gi://Gio";
import GnomeDesktop from "gi://GnomeDesktop";
import { gettext as _, Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { type LocationInUse, present, presentLocationUnknown, readClock } from "@sun-clock/core";
import { AutomaticLocation } from "./automaticLocation.ts";
import { SunClockIndicator } from "./indicator.ts";
import { civilTimeLocale } from "./locale.ts";
import {
  readLastKnownLocation,
  readLocationMode,
  readManualLocation,
  readReading,
  writeLastKnownLocation,
} from "./settings.ts";

export default class SunClockExtension extends Extension {
  #indicator: SunClockIndicator | null = null;
  #settings: Gio.Settings | null = null;
  #settingsChangedId = 0;
  #locationModeChangedId = 0;
  // Only exists in Automatic mode, so that Manual mode never asks the system for a Location.
  #automaticLocation: AutomaticLocation | null = null;
  // GNOME's WallClock notifies on each minute boundary and after suspend/resume, time-zone
  // changes and clock adjustments, so the extension needs no timer of its own.
  #wallClock: GnomeDesktop.WallClock | null = null;
  #wallClockChangedId = 0;

  override enable(): void {
    this.#indicator = new SunClockIndicator(this.metadata.name, {
      preferences: { label: _("Preferences"), activate: () => this.openPreferences() },
      // The Manual location settings are in the preferences.
      setManualLocation: { activate: () => this.openPreferences() },
    });
    Main.panel.addToStatusArea(this.uuid, this.#indicator.button, positionRightOfClock(), "center");

    this.#settings = this.getSettings();
    // Connected first, so that the Automatic location follows the mode before the refresh.
    this.#locationModeChangedId = this.#settings.connect("changed::location-mode", () =>
      this.#followLocationMode(),
    );
    this.#settingsChangedId = this.#settings.connect("changed", (_settings, key: string) => {
      // Only #update writes the Last known location, and it does not need refreshing for it.
      if (key !== "last-known-location") this.#refresh();
    });
    this.#followLocationMode();
    this.#wallClock = new GnomeDesktop.WallClock();
    this.#wallClockChangedId = this.#wallClock.connect("notify::clock", () => this.#refresh());

    this.#refresh();
  }

  override disable(): void {
    this.#wallClock?.disconnect(this.#wallClockChangedId);
    this.#wallClock?.run_dispose();
    this.#wallClock = null;
    this.#automaticLocation?.destroy();
    this.#automaticLocation = null;
    this.#settings?.disconnect(this.#locationModeChangedId);
    this.#settings?.disconnect(this.#settingsChangedId);
    this.#settings = null;
    this.#indicator?.destroy();
    this.#indicator = null;
  }

  #followLocationMode(): void {
    if (!this.#settings) return;
    const automatic = readLocationMode(this.#settings) === "automatic";
    if (automatic && !this.#automaticLocation) {
      this.#automaticLocation = new AutomaticLocation({
        changed: () => this.#refresh(),
        failed: (error) => this.getLogger().warn(error),
      });
    } else if (!automatic && this.#automaticLocation) {
      this.#automaticLocation.destroy();
      this.#automaticLocation = null;
    }
  }

  #refresh(): void {
    try {
      this.#update();
    } catch (error) {
      // Never leave a stale or broken Reading in the bar.
      this.#indicator?.hide();
      this.getLogger().error(error);
    }
  }

  #update(): void {
    if (!this.#indicator || !this.#settings || !this.#wallClock) return;

    const translate = (message: string): string => this.gettext(message);
    // The Location from the active mode, then the Last known location, then none.
    const fromMode = this.#locationFromMode(this.#settings);
    if (fromMode) writeLastKnownLocation(this.#settings, fromMode);
    const lastKnown = fromMode ? null : readLastKnownLocation(this.#settings);
    const location = fromMode ?? (lastKnown && { ...lastKnown, source: "last-known" as const });
    this.#indicator.show(
      location
        ? present(readClock(location, new Date()), {
            reading: readReading(this.#settings),
            timeZone: this.#wallClock.timezone.get_identifier(),
            locale: civilTimeLocale(),
            translate,
            location,
          })
        : presentLocationUnknown(translate),
    );
  }

  /** The Location from the active mode, if it has one. */
  #locationFromMode(settings: Gio.Settings): LocationInUse | null {
    if (readLocationMode(settings) === "manual") return readManualLocation(settings);
    const automatic = this.#automaticLocation?.location;
    return automatic ? { ...automatic, source: "automatic" } : null;
  }
}

/** The index in the panel's centre box just after the GNOME clock. */
function positionRightOfClock(): number {
  const clock = Main.panel.statusArea.dateMenu?.container;
  const siblings = clock?.get_parent()?.get_children() ?? [];
  return clock ? siblings.indexOf(clock) + 1 : 0;
}
