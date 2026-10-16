import type Gio from "gi://Gio";
import GnomeDesktop from "gi://GnomeDesktop";
import { gettext as _, Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { present, readClock } from "@sun-clock/core";
import { SunClockIndicator } from "./indicator.ts";
import { civilTimeLocale } from "./locale.ts";
import { readManualLocation, readReading } from "./settings.ts";

export default class SunClockExtension extends Extension {
  #indicator: SunClockIndicator | null = null;
  #settings: Gio.Settings | null = null;
  #settingsChangedId = 0;
  // GNOME's WallClock notifies on each minute boundary and after suspend/resume, time-zone
  // changes and clock adjustments, so the extension needs no timer of its own.
  #wallClock: GnomeDesktop.WallClock | null = null;
  #wallClockChangedId = 0;

  override enable(): void {
    this.#indicator = new SunClockIndicator(this.metadata.name, {
      preferences: { label: _("Preferences"), activate: () => this.openPreferences() },
    });
    Main.panel.addToStatusArea(this.uuid, this.#indicator.button, positionRightOfClock(), "center");

    this.#settings = this.getSettings();
    this.#settingsChangedId = this.#settings.connect("changed", () => this.#refresh());
    this.#wallClock = new GnomeDesktop.WallClock();
    this.#wallClockChangedId = this.#wallClock.connect("notify::clock", () => this.#refresh());

    this.#refresh();
  }

  override disable(): void {
    this.#wallClock?.disconnect(this.#wallClockChangedId);
    this.#wallClock?.run_dispose();
    this.#wallClock = null;
    this.#settings?.disconnect(this.#settingsChangedId);
    this.#settings = null;
    this.#indicator?.destroy();
    this.#indicator = null;
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

    const location = readManualLocation(this.#settings);
    if (!location) {
      this.#indicator.hide();
      return;
    }

    this.#indicator.show(
      present(readClock(location, new Date()), {
        reading: readReading(this.#settings),
        timeZone: this.#wallClock.timezone.get_identifier(),
        locale: civilTimeLocale(),
        translate: (message) => this.gettext(message),
        location,
      }),
    );
  }
}

/** The index in the panel's centre box just after the GNOME clock. */
function positionRightOfClock(): number {
  const clock = Main.panel.statusArea.dateMenu?.container;
  const siblings = clock?.get_parent()?.get_children() ?? [];
  return clock ? siblings.indexOf(clock) + 1 : 0;
}
