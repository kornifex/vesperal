import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { CLOCK_FORMATS, type ClockFormat } from "@vesperal/core";

/**
 * The BCP 47 locale in which to show Civil times, following LC_TIME as the GNOME clock does
 * (it may differ from the language of the messages).
 */
export function civilTimeLocale(): string {
  const [posixLocale = "C"] = GLib.get_language_names_with_category("LC_TIME");
  // "fr_FR.UTF-8@euro" → "fr-FR"
  const tag = posixLocale.replace(/[.@].*$/, "").replace("_", "-");
  return tag === "C" || tag === "POSIX" ? "en" : tag;
}

/**
 * The format of the GNOME clock, 24-hour or 12-hour, read from `desktopSettings` (the
 * `org.gnome.desktop.interface` schema), which Civil times follow whatever LC_TIME's habit.
 */
export function desktopClockFormat(desktopSettings: Gio.Settings): ClockFormat {
  const format = desktopSettings.get_string("clock-format");
  return CLOCK_FORMATS.find((value) => value === format) ?? CLOCK_FORMATS[0];
}
