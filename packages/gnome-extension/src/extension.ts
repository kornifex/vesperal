import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GnomeDesktop from "gi://GnomeDesktop";
import St from "gi://St";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { present, readClock } from "@sun-clock/core";
import { civilTimeLocale } from "./locale.ts";
import { readManualLocation, readReading } from "./settings.ts";
import { SunArcIcon } from "./sunArcIcon.ts";

export default class SunClockExtension extends Extension {
  #indicator: PanelMenu.Button | null = null;
  #arcIcon: SunArcIcon | null = null;
  #label: St.Label | null = null;
  #settings: Gio.Settings | null = null;
  #settingsChangedId = 0;
  // GNOME's WallClock notifies on each minute boundary and after suspend/resume, time-zone
  // changes and clock adjustments, so the extension needs no timer of its own.
  #wallClock: GnomeDesktop.WallClock | null = null;
  #wallClockChangedId = 0;

  override enable(): void {
    this.#arcIcon = new SunArcIcon();
    this.#label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
    const box = new St.BoxLayout({ style_class: "sun-clock-indicator" });
    box.add_child(this.#arcIcon.actor);
    box.add_child(this.#label);
    this.#indicator = new PanelMenu.Button(0.5, this.metadata.name, true);
    this.#indicator.add_child(box);
    Main.panel.addToStatusArea(this.uuid, this.#indicator, positionRightOfClock(), "center");

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
    this.#arcIcon = null;
    this.#label = null;
  }

  #refresh(): void {
    if (!this.#indicator || !this.#arcIcon || !this.#label || !this.#settings || !this.#wallClock) {
      return;
    }

    const location = readManualLocation(this.#settings);
    if (!location) {
      this.#indicator.hide();
      return;
    }

    const view = present(readClock(location, new Date()), {
      reading: readReading(this.#settings),
      timeZone: this.#wallClock.timezone.get_identifier(),
      locale: civilTimeLocale(),
      translate: (message) => this.gettext(message),
    });
    this.#arcIcon.arc = view.bar.arc;
    this.#label.text = view.bar.text;
    this.#indicator.show();
  }
}

/** The index in the panel's centre box just after the GNOME clock. */
function positionRightOfClock(): number {
  const clock = Main.panel.statusArea.dateMenu?.container;
  const siblings = clock?.get_parent()?.get_children() ?? [];
  return clock ? siblings.indexOf(clock) + 1 : 0;
}
