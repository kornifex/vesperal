import Gio from "gi://Gio";
import GnomeDesktop from "gi://GnomeDesktop";
import { gettext as _, Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import {
  type Localisation,
  type LocationInUse,
  NotificationSchedule,
  present,
  presentError,
  presentLocationUnknown,
  presentNotification,
  READINGS,
  readClock,
} from "@vesperal/core";
import { AutomaticLocation } from "./automaticLocation.ts";
import { VesperalIndicator } from "./indicator.ts";
import { civilTimeLocale, desktopClockFormat } from "./locale.ts";
import { Notifier } from "./notifier.ts";
import {
  readBarContent,
  readIndicatorPosition,
  readLocationInUse,
  readLocationMode,
  readNotificationLeadMinutes,
  readNotificationsEnabled,
  readNotifiedEvents,
  readPhaseBounds,
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
  #indicatorPositionChangedId = 0;
  // Only exists in Automatic mode, so that Manual mode never asks the system for a Location.
  #automaticLocation: AutomaticLocation | null = null;
  // GNOME's WallClock notifies on each minute boundary and after suspend/resume, time-zone
  // changes and clock adjustments, so the extension needs no timer of its own.
  #wallClock: GnomeDesktop.WallClock | null = null;
  #wallClockChangedId = 0;
  // The desktop's settings, for the format of its clock. The WallClock notifies when it
  // changes, since the clock then reads differently, so they need no handler of their own.
  #desktopSettings: Gio.Settings | null = null;
  // Kept while the extension is disabled, as it is when the screen is locked, so that unlocking
  // does not announce again the events already notified of. It is plain data, with nothing to
  // disconnect or destroy.
  #notificationSchedule: NotificationSchedule | null = null;
  #notifier: Notifier | null = null;

  override enable(): void {
    this.#settings = this.getSettings();
    this.#notificationSchedule ??= new NotificationSchedule();
    this.#notifier = new Notifier(
      this.metadata.name,
      new Gio.FileIcon({ file: this.dir.resolve_relative_path("icons/vesperal.svg") }),
    );
    this.#placeIndicator();
    // Connected first, so that the Automatic location follows the mode before the refresh.
    this.#locationModeChangedId = this.#settings.connect("changed::location-mode", () =>
      this.#followLocationMode(),
    );
    this.#sunArcPositionChangedId = this.#settings.connect("changed::sun-arc-position", () =>
      this.#placeSunArc(),
    );
    // Connected before the refresh, so that the new indicator shows the clock at once.
    this.#indicatorPositionChangedId = this.#settings.connect("changed::indicator-position", () =>
      this.#placeIndicator(),
    );
    this.#settingsChangedId = this.#settings.connect("changed", (_settings, key: string) => {
      // Only #update writes the Last known location, and it does not need refreshing for it.
      if (key !== "last-known-location") this.#refresh();
    });
    this.#followLocationMode();
    this.#desktopSettings = new Gio.Settings({ schema_id: "org.gnome.desktop.interface" });
    this.#wallClock = new GnomeDesktop.WallClock();
    this.#wallClockChangedId = this.#wallClock.connect("notify::clock", () => this.#refresh());

    this.#refresh();
  }

  override disable(): void {
    this.#wallClock?.disconnect(this.#wallClockChangedId);
    this.#wallClock = null;
    this.#desktopSettings = null;
    this.#automaticLocation?.destroy();
    this.#automaticLocation = null;
    this.#settings?.disconnect(this.#locationModeChangedId);
    this.#settings?.disconnect(this.#sunArcPositionChangedId);
    this.#settings?.disconnect(this.#indicatorPositionChangedId);
    this.#settings?.disconnect(this.#settingsChangedId);
    this.#settings = null;
    this.#indicator?.destroy();
    this.#indicator = null;
    this.#notifier?.destroy();
    this.#notifier = null;
  }

  /**
   * Places the indicator in the panel at the chosen position. A new indicator replaces the one
   * already there, since the panel only places an indicator when it is added.
   */
  #placeIndicator(): void {
    if (!this.#settings) return;
    this.#indicator?.destroy();
    this.#indicator = new VesperalIndicator(this.metadata.name, {
      preferences: { label: _("Preferences"), activate: () => this.openPreferences() },
      // The preferences open on the city search when no Location is known (see prefs.ts).
      manualLocationEntry: { activate: () => this.openPreferences() },
      secondaryClick: () => this.#switchReading(),
    });
    this.#indicator.addToPanel(this.uuid, readIndicatorPosition(this.#settings));
    this.#placeSunArc();
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

  /** Switches the bar to the next Reading, in the order of the preferences, round to the first. */
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
      // Shows an error rather than a stale or broken Reading.
      this.getLogger().error(error);
      this.#indicator?.show(presentError((message) => this.gettext(message)));
    }
  }

  #update(): void {
    if (!this.#indicator || !this.#settings || !this.#wallClock || !this.#desktopSettings) return;

    const now = new Date();
    const localisation: Localisation = {
      timeZone: this.#wallClock.timezone.get_identifier(),
      locale: civilTimeLocale(),
      clockFormat: desktopClockFormat(this.#desktopSettings),
      translate: (message) => this.gettext(message),
    };
    // Only the Automatic location is remembered: the Manual location stays in its own key. It
    // only exists in Automatic mode.
    const automatic = this.#automaticLocation?.location ?? null;
    if (automatic) writeLastKnownLocation(this.#settings, automatic);
    const location = readLocationInUse(this.#settings, automatic);
    const twilight = readTwilight(this.#settings);
    this.#indicator.show(
      location
        ? present(readClock(location, now, twilight, readPhaseBounds(this.#settings)), {
            reading: readReading(this.#settings),
            barContent: readBarContent(this.#settings),
            ...localisation,
            location,
          })
        : presentLocationUnknown(localisation.translate),
    );

    try {
      this.#notify(now, location, localisation);
    } catch (error) {
      // Logged apart from the refresh, so that the clock still shows when a notification fails.
      this.getLogger().warn(error);
    }
  }

  /**
   * Sends the notifications due at the tick `now`. Called on every refresh, even with
   * notifications off, so that the schedule always knows the previous tick.
   */
  #notify(now: Date, location: LocationInUse | null, localisation: Localisation): void {
    if (!this.#settings || !this.#notificationSchedule) return;
    const due = this.#notificationSchedule.due(now, location, {
      events: readNotificationsEnabled(this.#settings) ? readNotifiedEvents(this.#settings) : [],
      leadMinutes: readNotificationLeadMinutes(this.#settings),
      twilight: readTwilight(this.#settings),
    });
    if (!location) return;
    for (const notification of due) {
      this.#notifier?.notify(
        notification.event,
        presentNotification(notification, now, { ...localisation, location }),
      );
    }
  }
}
