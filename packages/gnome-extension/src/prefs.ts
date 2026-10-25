import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import {
  gettext as _,
  ExtensionPreferences,
  ngettext,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import {
  BAR_CONTENTS,
  eventNames,
  LOCATION_MODES,
  type NamedLocation,
  NOTIFIABLE_EVENTS,
  type NotifiableEvent,
  PHASE_BOUNDS,
  presentYear,
  READINGS,
  readYear,
  TWILIGHTS,
} from "@vesperal/core";
import { type City, CitySearch } from "./citySearch.ts";
import { civilTimeLocale } from "./locale.ts";
import {
  followLocationServices,
  INDICATOR_POSITIONS,
  readBarContent,
  readIndicatorPosition,
  readLastKnownLocation,
  readLocationInUse,
  readLocationMode,
  readManualLocation,
  readNotifiedEvents,
  readPhaseBounds,
  readReading,
  readSunArcPosition,
  readTwilight,
  SUN_ARC_POSITIONS,
  writeBarContent,
  writeIndicatorPosition,
  writeLocationMode,
  writeManualLocation,
  writeNotifiedEvents,
  writePhaseBounds,
  writeReading,
  writeSunArcPosition,
  writeTwilight,
} from "./settings.ts";
import { YearChart } from "./yearChart.ts";

const MAX_SEARCH_RESULTS = 8;

export default class VesperalPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    const displayPage = new Adw.PreferencesPage({
      // Translators: a page of the preferences, about what the top bar and the menu show.
      title: _("Display"),
      icon_name: "preferences-desktop-display-symbolic",
    });
    const locationPage = new Adw.PreferencesPage({
      title: _("Location and notifications"),
      icon_name: "mark-location-symbolic",
    });
    const yearPage = new Adw.PreferencesPage({
      title: _("Year"),
      icon_name: "x-office-calendar-symbolic",
    });
    window.add(displayPage);
    window.add(locationPage);
    window.add(yearPage);

    const location = addLocationGroups(locationPage, settings, window);
    const disconnects = [
      addReadingGroup(displayPage, settings),
      addBarContentGroup(displayPage, settings),
      addSunArcGroup(displayPage, settings),
      addIndicatorPositionGroup(displayPage, settings),
      addTwilightGroup(displayPage, settings),
      addPhaseBoundsGroup(displayPage, settings),
      location.disconnect,
      addNotificationGroup(locationPage, settings),
      addYearGroups(yearPage, settings, location.showCitySearch),
    ];
    window.connect("close-request", () => {
      for (const disconnect of disconnects) disconnect();
      return false;
    });
  }
}

/**
 * Adds the choice of Reading, explained for the Phase bounds in use; returns a function that
 * stops following the settings.
 */
function addReadingGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Reading"),
    description: _("The duration shown in the top bar"),
  });
  page.add(group);

  const { rows, disconnect } = addChoiceRows(
    group,
    settings,
    { key: "reading", values: READINGS, read: readReading, write: writeReading },
    {
      remaining: { title: _("Remaining time"), subtitle: "" },
      elapsed: { title: _("Elapsed time"), subtitle: "" },
      "elapsed-and-remaining": { title: _("Elapsed and remaining time"), subtitle: "" },
    },
  );
  const followPhaseBounds = (): void => {
    const fromDawn = readPhaseBounds(settings) === "dawn-dusk";
    const remainingRow = rows.get("remaining");
    const elapsedRow = rows.get("elapsed");
    const bothRow = rows.get("elapsed-and-remaining");
    if (remainingRow) {
      remainingRow.subtitle = fromDawn
        ? _("Until the next dawn or dusk")
        : _("Until the next sunrise or sunset");
    }
    if (elapsedRow) {
      elapsedRow.subtitle = fromDawn
        ? _("Since the last dawn or dusk")
        : _("Since the last sunrise or sunset");
    }
    if (bothRow) {
      bothRow.subtitle = fromDawn
        ? _("Since the last dawn or dusk, and until the next")
        : _("Since the last sunrise or sunset, and until the next");
    }
  };
  followPhaseBounds();
  const phaseBoundsChangedId = settings.connect("changed::phase-bounds", followPhaseBounds);
  return () => {
    disconnect();
    settings.disconnect(phaseBoundsChangedId);
  };
}

/** Adds the choice of what the bar shows; returns a function that stops following the settings. */
function addBarContentGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Content"),
    description: _("What the top bar shows"),
  });
  page.add(group);

  const { disconnect } = addChoiceRows(
    group,
    settings,
    { key: "bar-content", values: BAR_CONTENTS, read: readBarContent, write: writeBarContent },
    {
      "arc-and-duration": { title: _("Sun arc and duration"), subtitle: "" },
      arc: { title: _("Sun arc only"), subtitle: "" },
      duration: { title: _("Duration only"), subtitle: "" },
    },
  );
  return disconnect;
}

/**
 * Adds the choice of Sun arc position, offered only when the bar shows both the Sun arc and the
 * duration. Returns a function that stops following the settings.
 */
function addSunArcGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Sun arc"),
    description: _("Its side of the Reading in the top bar"),
  });
  page.add(group);
  const followBarContent = (): void => {
    group.sensitive = readBarContent(settings) === "arc-and-duration";
  };
  followBarContent();
  const barContentChangedId = settings.connect("changed::bar-content", followBarContent);

  const { disconnect } = addChoiceRows(
    group,
    settings,
    {
      key: "sun-arc-position",
      values: SUN_ARC_POSITIONS,
      read: readSunArcPosition,
      write: writeSunArcPosition,
    },
    {
      left: { title: _("Left"), subtitle: "" },
      right: { title: _("Right"), subtitle: "" },
    },
  );
  return () => {
    disconnect();
    settings.disconnect(barContentChangedId);
  };
}

/** Adds the choice of indicator position; returns a function that stops following the settings. */
function addIndicatorPositionGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    // Translators: where the indicator sits in the top bar, not a geographic position.
    title: _("Position"),
    description: _("Where the indicator sits in the top bar"),
  });
  page.add(group);

  const { disconnect } = addChoiceRows(
    group,
    settings,
    {
      key: "indicator-position",
      values: INDICATOR_POSITIONS,
      read: readIndicatorPosition,
      write: writeIndicatorPosition,
    },
    {
      "next-to-clock": { title: _("Next to the clock"), subtitle: "" },
      left: { title: _("Left side"), subtitle: _("After the workspace indicator") },
      right: { title: _("Right side"), subtitle: _("Before the system indicators") },
    },
  );
  return disconnect;
}

/** Adds the choice of Twilight; returns a function that stops following the settings. */
function addTwilightGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Twilight"),
    description: _("When Dawn and Dusk fall"),
  });
  page.add(group);

  const { disconnect } = addChoiceRows(
    group,
    settings,
    { key: "twilight", values: TWILIGHTS, read: readTwilight, write: writeTwilight },
    {
      civil: { title: _("Civil"), subtitle: _("Sun 6° below the horizon") },
      nautical: { title: _("Nautical"), subtitle: _("Sun 12° below the horizon") },
      astronomical: { title: _("Astronomical"), subtitle: _("Sun 18° below the horizon") },
    },
  );
  return disconnect;
}

/** Adds the choice of Phase bounds; returns a function that stops following the settings. */
function addPhaseBoundsGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({
    title: _("Day and night"),
    description: _("When the day begins and ends"),
  });
  page.add(group);
  const dawnDuskExplanation = _(
    // Translators: "the twilight above" is the choice of Twilight just above this one.
    "The day lasts as long as it is light enough outside for the twilight above. With nautical or astronomical twilight, summer nights may not get that dark for weeks, even at mid-latitudes.",
  );

  const { disconnect } = addChoiceRows(
    group,
    settings,
    { key: "phase-bounds", values: PHASE_BOUNDS, read: readPhaseBounds, write: writePhaseBounds },
    {
      "sunrise-sunset": { title: _("From sunrise to sunset"), subtitle: "" },
      "dawn-dusk": { title: _("From dawn to dusk"), subtitle: dawnDuskExplanation },
    },
  );
  return disconnect;
}

/**
 * Adds the choice between Automatic and Manual location, and the Manual location: an offline
 * city search, and direct latitude and longitude entry. Choosing a Manual location also
 * chooses Manual mode. Returns a function that stops following the settings, and one that
 * shows the city search.
 */
function addLocationGroups(
  page: Adw.PreferencesPage,
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
): { disconnect: () => void; showCitySearch: () => void } {
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
  const showCitySearch = (): void => {
    window.visible_page = page;
    searchRow.grab_focus();
  };
  // With no Location to fall back on, the clock reads "Location unknown" and its menu leads
  // here to set one: open on the city search.
  if (!readManualLocation(settings) && !readLastKnownLocation(settings)) showCitySearch();

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

  const showLocationServices = (enabled: boolean): void => {
    if (!automaticRow) return;
    automaticRow.subtitle = enabled
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

  const stopFollowingLocationServices = followLocationServices(showLocationServices);
  showManualLocation();
  const manualLocationChangedId = settings.connect("changed::manual-location", showManualLocation);
  return {
    disconnect: () => {
      modes.disconnect();
      stopFollowingLocationServices();
      settings.disconnect(manualLocationChangedId);
    },
    showCitySearch,
  };
}

/**
 * Adds the notifications: whether to send them, ahead of which events, and how long ahead.
 * Returns a function that stops following the settings.
 */
function addNotificationGroup(page: Adw.PreferencesPage, settings: Gio.Settings): () => void {
  const group = new Adw.PreferencesGroup({ title: _("Notifications") });
  page.add(group);
  const enabledRow = new Adw.SwitchRow({ title: _("Send notifications") });
  settings.bind("notifications", enabledRow, "active", Gio.SettingsBindFlags.DEFAULT);
  group.add(enabledRow);

  const names = eventNames(_);
  const buttons = new Map<NotifiableEvent, Gtk.CheckButton>();
  // While the buttons are being set from the settings, their toggles are not choices.
  let showing = false;
  for (const event of NOTIFIABLE_EVENTS) {
    const button = new Gtk.CheckButton({ valign: Gtk.Align.CENTER });
    button.connect("toggled", () => {
      if (showing) return;
      writeNotifiedEvents(
        settings,
        NOTIFIABLE_EVENTS.filter((other) => buttons.get(other)?.active),
      );
    });
    const row = new Adw.ActionRow({ title: names[event], activatable_widget: button });
    row.add_prefix(button);
    settings.bind("notifications", row, "sensitive", Gio.SettingsBindFlags.GET);
    group.add(row);
    buttons.set(event, button);
  }

  const leadRow = Adw.SpinRow.new_with_range(0, 180, 5);
  leadRow.title = _("Minutes before");
  leadRow.subtitle = _("0 notifies at the event itself");
  settings.bind("notification-lead-time", leadRow, "value", Gio.SettingsBindFlags.DEFAULT);
  settings.bind("notifications", leadRow, "sensitive", Gio.SettingsBindFlags.GET);
  group.add(leadRow);

  const showEvents = (): void => {
    const events = readNotifiedEvents(settings);
    showing = true;
    for (const [event, button] of buttons) button.active = events.includes(event);
    showing = false;
  };
  showEvents();
  const eventsChangedId = settings.connect("changed::notification-events", showEvents);
  // The bindings go with the widgets when the window closes; the handler has to be let go.
  return () => settings.disconnect(eventsChangedId);
}

/**
 * Adds the year at the Location in use: a chart of the Day length through the year, then
 * today's Day length and the next Solstice and Equinox. With no Location known, offers to set
 * one instead, through `showCitySearch`. Follows the settings and the date, so that today stays
 * marked while the window is open; returns a function that stops following them.
 */
function addYearGroups(
  page: Adw.PreferencesPage,
  settings: Gio.Settings,
  showCitySearch: () => void,
): () => void {
  const chartGroup = new Adw.PreferencesGroup({ title: _("Day length through the year") });
  const chart = new YearChart();
  chartGroup.add(chart.widget);
  const rowsGroup = new Adw.PreferencesGroup();
  let rows: Adw.ActionRow[] = [];

  const setLocationButton = new Gtk.Button({
    label: _("Set a location"),
    halign: Gtk.Align.CENTER,
    css_classes: ["pill", "suggested-action"],
  });
  setLocationButton.connect("clicked", showCitySearch);
  const unknownGroup = new Adw.PreferencesGroup();
  unknownGroup.add(
    new Adw.StatusPage({
      icon_name: "mark-location-symbolic",
      title: _("Location unknown"),
      description: _("Set a location to see its year"),
      child: setLocationButton,
    }),
  );
  for (const group of [chartGroup, rowsGroup, unknownGroup]) page.add(group);

  // The date the page was last shown for.
  let shownDate = "";
  const show = (): void => {
    shownDate = localDate();
    // The preferences never ask the system where the user is: in Automatic mode, they use the
    // Last known location.
    const location = readLocationInUse(settings, null);
    chartGroup.visible = rowsGroup.visible = location !== null;
    unknownGroup.visible = location === null;
    if (!location) return;

    const timeZone = GLib.TimeZone.new_local().get_identifier();
    const snapshot = readYear(
      location,
      new Date(),
      timeZone,
      readTwilight(settings),
      readPhaseBounds(settings),
    );
    const view = presentYear(snapshot, {
      timeZone,
      locale: civilTimeLocale(),
      translate: _,
      translatePlural: ngettext,
    });
    chart.view = view;
    for (const row of rows) rowsGroup.remove(row);
    rows = view.rows.map(({ label, value }) => {
      const row = new Adw.ActionRow({ title: label, subtitle: value, css_classes: ["property"] });
      rowsGroup.add(row);
      return row;
    });
  };
  show();
  const changedIds = [
    "location-mode",
    "manual-location",
    "last-known-location",
    "twilight",
    "phase-bounds",
  ].map((key) => settings.connect(`changed::${key}`, show));
  // Checked every minute rather than timed for midnight, so that a suspend over midnight is
  // caught up on too.
  const dateCheckId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
    if (localDate() !== shownDate) show();
    return GLib.SOURCE_CONTINUE;
  });
  return () => {
    for (const id of changedIds) settings.disconnect(id);
    GLib.source_remove(dateCheckId);
    chart.disconnect();
  };
}

/** Today's date in the local time zone, as YYYY-MM-DD. */
function localDate(): string {
  return GLib.DateTime.new_now_local().format("%F") ?? "";
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
