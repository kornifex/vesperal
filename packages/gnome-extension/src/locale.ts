import GLib from "gi://GLib";

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
