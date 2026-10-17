import type Gio from "gi://Gio";
import GnomeDesktop from "gi://GnomeDesktop";
import { gettext as _, Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {
  type LocationMode,
  type NamedLocation,
  present,
  presentError,
  presentLocationUnknown,
  READINGS,
  readClock,
  resolveLocation,
} from "@vesperal/core";
import { AutomaticLocation } from "./automaticLocation.ts";
import { VesperalIndicator } from "./indicator.ts";
import { civilTimeLocale } from "./locale.ts";
import {
  readLastKnownLocation,
  readLocationMode,
  readManualLocation,
  readReading,
  readSunArcPosition,
  readTwilight,
  writeLastKnownLocation,
  writeReading,
} from "./settings.ts";

export default class VesperalExtension extends Extension {
  #indicator: VesperalIndicator | null = null;
  #settings: Gio.Settings | null = null;
  #settingsChangedId = 0;
  #locationModeChangedId = 0;
  #sunArcPositionChangedId = 0;
  // Only exists in Automatic mode, so that Manual mode never asks the system for a Location.
  #automaticLocation: AutomaticLocation | null = null;
  // GNOME's WallClock notifies on each minute boundary and after suspend/resume, time-zone
  // changes and clock adjustments, so the extension needs no timer of its own.
  #wallClock: GnomeDesktop.WallClock | null = null;
  #wallClockChangedId = 0;

  override enable(): void {
    this.#indicator = new VesperalIndicator(this.metadata.name, {
      preferences: { label: _("Preferences"), activate: () => this.openPreferences() },
      // The preferences open on the city search when no Location is known (see prefs.ts).
      manualLocationEntry: { activate: () => this.openPreferences() },
      secondaryClick: () => this.#switchReading(),
    });
    this.#indicator.addToPanel(this.uuid, positionRightOfClock());

    this.#settings = this.getSettings();
    // Connected first, so that the Automatic location follows the mode before the refresh.
    this.#locationModeChangedId = this.#settings.connect("changed::location-mode", () =>
      this.#followLocationMode(),
    );
    this.#sunArcPositionChangedId = this.#settings.connect("changed::sun-arc-position", () =>
      this.#placeSunArc(),
    );
    this.#settingsChangedId = this.#settings.connect("changed", (_settings, key: string) => {
      // Only #update writes the Last known location, and it does not need refreshing for it.
      if (key !== "last-known-location") this.#refresh();
    });
    this.#followLocationMode();
    this.#placeSunArc();
    this.#wallClock = new GnomeDesktop.WallClock();
    this.#wallClockChangedId = this.#wallClock.connect("notify::clock", () => this.#refresh());

    this.#refresh();
  }

  override disable(): void {
    this.#wallClock?.disconnect(this.#wallClockChangedId);
    this.#wallClock = null;
    this.#automaticLocation?.destroy();
    this.#automaticLocation = null;
    this.#settings?.disconnect(this.#locationModeChangedId);
    this.#settings?.disconnect(this.#sunArcPositionChangedId);
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

  /** Switches the bar to the next Reading, which the menu showed alongside it. */
  #switchReading(): void {
    if (!this.#settings) return;
    const current = READINGS.indexOf(readReading(this.#settings));
    writeReading(this.#settings, READINGS[(current + 1) % READINGS.length] ?? READINGS[0]);
  }

  #placeSunArc(): void {
    if (this.#settings) this.#indicator?.placeSunArc(readSunArcPosition(this.#settings));
  }

  #refresh(): void {
    try {
      this.#update();
    } catch (error) {
      // Never leave a stale or broken Reading in the bar.
      this.getLogger().error(error);
      this.#indicator?.show(presentError((message) => this.gettext(message)));
    }
  }

  #update(): void {
    if (!this.#indicator || !this.#settings || !this.#wallClock) return;

    const translate = (message: string): string => this.gettext(message);
    const mode = readLocationMode(this.#settings);
    const fromMode = this.#locationFromMode(mode, this.#settings);
    // Only the Automatic location is remembered: the Manual location stays in its own key.
    if (mode === "automatic" && fromMode) writeLastKnownLocation(this.#settings, fromMode);
    const location = resolveLocation(mode, fromMode, readLastKnownLocation(this.#settings));
    this.#indicator.show(
      location
        ? present(readClock(location, new Date(), readTwilight(this.#settings)), {
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
  #locationFromMode(mode: LocationMode, settings: Gio.Settings): NamedLocation | null {
    if (mode === "manual") return readManualLocation(settings);
    return this.#automaticLocation?.location ?? null;
  }
}

/** The index in the panel's centre box just after the GNOME clock. */
function positionRightOfClock(): number {
  const clock = Main.panel.statusArea.dateMenu?.container;
  const siblings = clock?.get_parent()?.get_children() ?? [];
  return clock ? siblings.indexOf(clock) + 1 : 0;
}
