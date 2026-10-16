import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import {
  gettext as _,
  ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { READINGS, type Reading } from "@sun-clock/core";
import { readReading, writeReading } from "./settings.ts";

export default class SunClockPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    window.add(page);

    const readingGroup = new Adw.PreferencesGroup({
      title: _("Reading"),
      description: _("The duration shown in the top bar"),
    });
    page.add(readingGroup);

    const readingChoices: Record<Reading, { title: string; subtitle: string }> = {
      remaining: { title: _("Remaining time"), subtitle: _("Until the next sunrise or sunset") },
      elapsed: { title: _("Elapsed time"), subtitle: _("Since the last sunrise or sunset") },
    };
    const readingButtons = new Map<Reading, Gtk.CheckButton>();
    let firstButton: Gtk.CheckButton | undefined;
    for (const reading of READINGS) {
      const button = new Gtk.CheckButton({ valign: Gtk.Align.CENTER });
      if (firstButton) button.group = firstButton;
      else firstButton = button;
      button.connect("toggled", () => {
        if (button.active) writeReading(settings, reading);
      });
      const row = new Adw.ActionRow({ ...readingChoices[reading], activatable_widget: button });
      row.add_prefix(button);
      readingGroup.add(row);
      readingButtons.set(reading, button);
    }

    const showReading = (): void => {
      const button = readingButtons.get(readReading(settings));
      if (button) button.active = true;
    };
    showReading();
    const changedId = settings.connect("changed::reading", showReading);
    window.connect("close-request", () => {
      settings.disconnect(changedId);
      return false;
    });
  }
}
