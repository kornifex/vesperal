import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
  gettext as _,
  ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { READINGS, type Reading } from "@sun-clock/core";
import { type City, CitySearch } from "./citySearch.ts";
import { readManualLocation, readReading, writeManualLocation, writeReading } from "./settings.ts";

const MAX_SEARCH_RESULTS = 8;

export default class SunClockPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    window.add(page);

    const disconnects = [
      addReadingGroup(page, settings),
      addManualLocationGroups(page, settings, window),
    ];
    window.connect("close-request", () => {
      for (const disconnect of disconnects) disconnect();
      return false;
    });
  }
}

/** Adds the choice of Reading; returns a function that stops following the settings. */
function addReadingGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Reading"),
    description: _("The duration shown in the top bar"),
  });
  page.add(group);

  const choices: Record<Reading, { title: string; subtitle: string }> = {
    remaining: { title: _("Remaining time"), subtitle: _("Until the next sunrise or sunset") },
    elapsed: { title: _("Elapsed time"), subtitle: _("Since the last sunrise or sunset") },
  };
  const buttons = new Map<Reading, Gtk.CheckButton>();
  let firstButton: Gtk.CheckButton | undefined;
  for (const reading of READINGS) {
    const button = new Gtk.CheckButton({ valign: Gtk.Align.CENTER });
    if (firstButton) button.group = firstButton;
    else firstButton = button;
    button.connect("toggled", () => {
      if (button.active) writeReading(settings, reading);
    });
    const row = new Adw.ActionRow({ ...choices[reading], activatable_widget: button });
    row.add_prefix(button);
    group.add(row);
    buttons.set(reading, button);
  }

  const show = (): void => {
    const button = buttons.get(readReading(settings));
    if (button) button.active = true;
  };
  show();
  const changedId = settings.connect("changed::reading", show);
  return () => settings.disconnect(changedId);
}

/**
 * Adds the Manual location: the current one, an offline city search, and direct latitude and
 * longitude entry. Returns a function that stops following the settings.
 */
function addManualLocationGroups(
  page: Adw.PreferencesPage,
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
): () => void {
  const group = new Adw.PreferencesGroup({ title: _("Manual location") });
  page.add(group);
  const currentRow = new Adw.ActionRow();
  group.add(currentRow);
  const searchRow = new Adw.EntryRow({ title: _("Search for a city") });
  group.add(searchRow);

  const resultsGroup = new Adw.PreferencesGroup({ visible: false });
  page.add(resultsGroup);
  let resultRows: Adw.ActionRow[] = [];

  const coordinatesGroup = new Adw.PreferencesGroup({
    title: _("Coordinates"),
    description: _("For any point on Earth, in decimal degrees"),
  });
  page.add(coordinatesGroup);
  const latitudeRow = new Adw.EntryRow({
    title: _("Latitude (north positive)"),
    show_apply_button: true,
    input_purpose: Gtk.InputPurpose.NUMBER,
  });
  const longitudeRow = new Adw.EntryRow({
    title: _("Longitude (east positive)"),
    show_apply_button: true,
    input_purpose: Gtk.InputPurpose.NUMBER,
  });
  coordinatesGroup.add(latitudeRow);
  coordinatesGroup.add(longitudeRow);

  const show = (): void => {
    const location = readManualLocation(settings);
    const coordinates = location ? `${round(location.latitude)}, ${round(location.longitude)}` : "";
    currentRow.title = location?.name ?? coordinates;
    currentRow.subtitle = location ? (location.name ? coordinates : "") : _("No location set");
    setTextUnchanged(latitudeRow, location ? String(round(location.latitude)) : "");
    setTextUnchanged(longitudeRow, location ? String(round(location.longitude)) : "");
    for (const row of [latitudeRow, longitudeRow]) row.remove_css_class("error");
  };

  const choose = (city: City): void => {
    writeManualLocation(settings, city);
    searchRow.text = "";
  };

  const citySearch = new CitySearch();
  searchRow.connect("changed", () => {
    for (const row of resultRows) resultsGroup.remove(row);
    resultRows = citySearch.search(searchRow.text, MAX_SEARCH_RESULTS).map((city) => {
      const row = new Adw.ActionRow({ title: city.name, subtitle: city.region, activatable: true });
      row.connect("activated", () => choose(city));
      resultsGroup.add(row);
      return row;
    });
    resultsGroup.visible = resultRows.length > 0;
  });
  searchRow.connect("entry-activated", () => {
    const [first] = citySearch.search(searchRow.text, 1);
    if (first) choose(first);
  });

  const applyCoordinates = (): void => {
    const latitude = parseDegrees(latitudeRow.text, 90);
    const longitude = parseDegrees(longitudeRow.text, 180);
    latitudeRow.remove_css_class("error");
    longitudeRow.remove_css_class("error");
    if (latitude === null) {
      latitudeRow.add_css_class("error");
      window.add_toast(new Adw.Toast({ title: _("Latitude must be between −90 and 90") }));
    } else if (longitude === null) {
      longitudeRow.add_css_class("error");
      window.add_toast(new Adw.Toast({ title: _("Longitude must be between −180 and 180") }));
    } else {
      writeManualLocation(settings, { name: null, latitude, longitude });
    }
  };
  latitudeRow.connect("apply", applyCoordinates);
  longitudeRow.connect("apply", applyCoordinates);

  show();
  const changedId = settings.connect("changed::manual-location", show);
  return () => settings.disconnect(changedId);
}

/** Sets the text of an entry row without revealing its apply button, as typing would. */
function setTextUnchanged(row: Adw.EntryRow, text: string): void {
  row.show_apply_button = false;
  row.text = text;
  row.show_apply_button = true;
}

/** Decimal degrees within ±`limit`, accepting a decimal comma; null if invalid. */
function parseDegrees(text: string, limit: number): number | null {
  const normalised = text.trim().replace(",", ".").replace("−", "-");
  if (!/^[-+]?\d+(\.\d+)?$/.test(normalised)) return null;
  const degrees = Number(normalised);
  return Math.abs(degrees) <= limit ? degrees : null;
}

/** Enough precision for any city, without float noise. */
function round(degrees: number): number {
  return Math.round(degrees * 10_000) / 10_000;
}
