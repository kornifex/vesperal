import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
  gettext as _,
  ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { LOCATION_MODES, type NamedLocation, READINGS } from "@sun-clock/core";
import { type City, CitySearch } from "./citySearch.ts";
import {
  readLastKnownLocation,
  readLocationMode,
  readManualLocation,
  readReading,
  writeLocationMode,
  writeManualLocation,
  writeReading,
} from "./settings.ts";

const MAX_SEARCH_RESULTS = 8;

export default class SunClockPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    window.add(page);

    const disconnects = [
      addReadingGroup(page, settings),
      addLocationGroups(page, settings, window),
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

  const { disconnect } = addChoiceRows(
    group,
    settings,
    { key: "reading", values: READINGS, read: readReading, write: writeReading },
    {
      remaining: { title: _("Remaining time"), subtitle: _("Until the next sunrise or sunset") },
      elapsed: { title: _("Elapsed time"), subtitle: _("Since the last sunrise or sunset") },
    },
  );
  return disconnect;
}

/**
 * Adds the choice between Automatic and Manual location, and the Manual location: an offline
 * city search, and direct latitude and longitude entry. Choosing a Manual location also
 * chooses Manual mode. Returns a function that stops following the settings.
 */
function addLocationGroups(
  page: Adw.PreferencesPage,
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
): () => void {
  const group = new Adw.PreferencesGroup({ title: _("Location") });
  page.add(group);
  const modes = addChoiceRows(
    group,
    settings,
    {
      key: "location-mode",
      values: LOCATION_MODES,
      read: readLocationMode,
      write: writeLocationMode,
    },
    {
      automatic: { title: _("Automatic"), subtitle: "" },
      manual: { title: _("Manual"), subtitle: "" },
    },
  );
  const automaticRow = modes.rows.get("automatic");
  const manualRow = modes.rows.get("manual");
  const searchRow = new Adw.EntryRow({ title: _("Search for a city") });
  group.add(searchRow);
  // With no Location to fall back on, the clock reads "Location unknown" and its menu leads
  // here to set one: start on the city search.
  if (!readManualLocation(settings) && !readLastKnownLocation(settings)) searchRow.grab_focus();

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

  const locationServices = new Gio.Settings({ schema_id: "org.gnome.system.location" });
  const showLocationServices = (): void => {
    if (!automaticRow) return;
    automaticRow.subtitle = locationServices.get_boolean("enabled")
      ? _("From the system's location services")
      : _("Location services are off");
  };

  const showManualLocation = (): void => {
    const location = readManualLocation(settings);
    const coordinates = location ? `${round(location.latitude)}, ${round(location.longitude)}` : "";
    if (manualRow) manualRow.subtitle = location?.name ?? (coordinates || _("No location set"));
    setTextUnchanged(latitudeRow, location ? String(round(location.latitude)) : "");
    setTextUnchanged(longitudeRow, location ? String(round(location.longitude)) : "");
    for (const row of [latitudeRow, longitudeRow]) row.remove_css_class("error");
  };

  const chooseManualLocation = (location: NamedLocation): void => {
    writeManualLocation(settings, location);
    writeLocationMode(settings, "manual");
  };

  const choose = (city: City): void => {
    chooseManualLocation(city);
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
      chooseManualLocation({ name: null, latitude, longitude });
    }
  };
  latitudeRow.connect("apply", applyCoordinates);
  longitudeRow.connect("apply", applyCoordinates);

  showLocationServices();
  showManualLocation();
  const locationServicesChangedId = locationServices.connect(
    "changed::enabled",
    showLocationServices,
  );
  const manualLocationChangedId = settings.connect("changed::manual-location", showManualLocation);
  return () => {
    modes.disconnect();
    locationServices.disconnect(locationServicesChangedId);
    settings.disconnect(manualLocationChangedId);
  };
}

/**
 * Adds to `group` one radio row per value of a settings key, in the order of `values`, and
 * keeps them in step with the settings. Returns the rows, and a function that stops following
 * the settings.
 */
function addChoiceRows<T extends string>(
  group: Adw.PreferencesGroup,
  settings: Gio.Settings,
  setting: {
    key: string;
    values: readonly T[];
    read: (settings: Gio.Settings) => T;
    write: (settings: Gio.Settings, value: T) => void;
  },
  choices: Record<T, { title: string; subtitle: string }>,
): { rows: ReadonlyMap<T, Adw.ActionRow>; disconnect: () => void } {
  const rows = new Map<T, Adw.ActionRow>();
  const buttons = new Map<T, Gtk.CheckButton>();
  let firstButton: Gtk.CheckButton | undefined;
  for (const value of setting.values) {
    const button = new Gtk.CheckButton({ valign: Gtk.Align.CENTER });
    if (firstButton) button.group = firstButton;
    else firstButton = button;
    button.connect("toggled", () => {
      if (button.active) setting.write(settings, value);
    });
    const row = new Adw.ActionRow({ ...choices[value], activatable_widget: button });
    row.add_prefix(button);
    group.add(row);
    rows.set(value, row);
    buttons.set(value, button);
  }

  const show = (): void => {
    const button = buttons.get(setting.read(settings));
    if (button) button.active = true;
  };
  show();
  const changedId = settings.connect(`changed::${setting.key}`, show);
  return { rows, disconnect: () => settings.disconnect(changedId) };
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
