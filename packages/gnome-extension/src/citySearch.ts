import GWeather from "gi://GWeather?version=4.0";
import { isValidLocation } from "@sun-clock/core";

export interface City {
  readonly name: string;
  /** Where the city is, e.g. "Île-de-France, France", to tell homonyms apart. */
  readonly region: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface IndexedCity extends City {
  readonly key: string;
}

/** Searches cities by name, offline, in GWeather's location database. */
export class CitySearch {
  #index: IndexedCity[] | null = null;

  /** Up to `limit` cities whose name contains `query`, those starting with it first. */
  search(query: string, limit: number): City[] {
    const key = searchKey(query.trim());
    if (key.length < 2) return [];
    const matches = this.#cities().filter((city) => city.key.includes(key));
    const startsWithQuery = (city: IndexedCity): number => (city.key.startsWith(key) ? 0 : 1);
    return matches
      .sort((a, b) => startsWithQuery(a) - startsWithQuery(b) || a.key.localeCompare(b.key))
      .slice(0, limit);
  }

  #cities(): IndexedCity[] {
    this.#index ??= collectCities(GWeather.Location.get_world());
    return this.#index;
  }
}

function collectCities(root: GWeather.Location | null): IndexedCity[] {
  const cities: IndexedCity[] = [];
  const visit = (location: GWeather.Location): void => {
    if (location.get_level() === GWeather.LocationLevel.CITY && location.has_coords()) {
      const name = location.get_name() ?? "";
      const [latitude, longitude] = location.get_coords();
      // The database has a few entries with impossible coordinates; they would mislead.
      if (isValidLocation({ latitude, longitude })) {
        cities.push({
          name,
          region: regionOf(location),
          latitude,
          longitude,
          key: searchKey(name),
        });
      }
    }
    for (let child = location.next_child(null); child; child = location.next_child(child)) {
      visit(child);
    }
  };
  if (root) visit(root);
  return cities;
}

function regionOf(city: GWeather.Location): string {
  const parts: string[] = [];
  for (let parent = city.get_parent(); parent; parent = parent.get_parent()) {
    const level = parent.get_level();
    if (level === GWeather.LocationLevel.ADM1 || level === GWeather.LocationLevel.COUNTRY) {
      const name = parent.get_name();
      if (name) parts.push(name);
    }
  }
  return parts.join(", ");
}

// Letters that Unicode does not decompose into a base letter and an accent.
const FOLDED_LETTERS: Readonly<Record<string, string>> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ı: "i",
};

/** Lower case without accents, so that "sao" finds "São Paulo" and "tromso" "Tromsø". */
function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øæœßłđı]/g, (letter) => FOLDED_LETTERS[letter] ?? letter);
}
