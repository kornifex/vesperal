import Geoclue from "gi://Geoclue";
import Gio from "gi://Gio";
import GWeather from "gi://GWeather?version=4.0";
import type { NamedLocation } from "@sun-clock/core";
import { followLocationServices } from "./settings.ts";

// The extension runs inside GNOME Shell, so it asks GeoClue as the Shell, like its weather.
const DESKTOP_ID = "org.gnome.Shell";

/**
 * The Automatic location: follows GeoClue at city-level accuracy while the GNOME location
 * services are on, and has no Location while they are off. GeoClue is asked only between
 * construction and `destroy()`.
 */
export class AutomaticLocation {
  #location: NamedLocation | null = null;
  readonly #changed: () => void;
  readonly #failed: (error: unknown) => void;
  readonly #stopFollowingLocationServices: () => void;
  // Set from the moment GeoClue is asked until it is let go.
  #cancellable: Gio.Cancellable | null = null;
  #geoclue: Geoclue.Simple | null = null;
  #geoclueChangedId = 0;

  constructor(callbacks: { changed: () => void; failed: (error: unknown) => void }) {
    this.#changed = callbacks.changed;
    this.#failed = callbacks.failed;
    this.#stopFollowingLocationServices = followLocationServices((enabled) => {
      if (enabled) this.#start();
      else this.#stop();
    });
  }

  /** The latest Location from GeoClue, or null if there is none yet or no longer. */
  get location(): NamedLocation | null {
    return this.#location;
  }

  /** Lets go of GeoClue, without notifying that the Location has gone. */
  destroy(): void {
    this.#stopFollowingLocationServices();
    this.#location = null;
    this.#stop();
  }

  #start(): void {
    if (this.#cancellable) return;
    const cancellable = new Gio.Cancellable();
    this.#cancellable = cancellable;
    Geoclue.Simple.new(DESKTOP_ID, Geoclue.AccuracyLevel.CITY, cancellable, (_source, result) => {
      let geoclue: Geoclue.Simple;
      try {
        geoclue = Geoclue.Simple.new_finish(result);
      } catch (error) {
        if (cancellable.is_cancelled()) return;
        // Let a later switch of the location services try again.
        this.#cancellable = null;
        this.#failed(error);
        return;
      }
      if (cancellable.is_cancelled()) {
        geoclue.client?.call_stop(null, null);
        return;
      }
      this.#geoclue = geoclue;
      this.#geoclueChangedId = geoclue.connect("notify::location", () => this.#read());
      this.#read();
    });
  }

  #stop(): void {
    this.#cancellable?.cancel();
    this.#cancellable = null;
    if (this.#geoclue) {
      this.#geoclue.disconnect(this.#geoclueChangedId);
      this.#geoclue.client?.call_stop(null, null);
      this.#geoclue = null;
    }
    if (this.#location) {
      this.#location = null;
      this.#changed();
    }
  }

  #read(): void {
    const location = this.#geoclue?.location;
    if (!location) return;
    const { latitude, longitude } = location;
    this.#location = { name: nearestCityName(latitude, longitude), latitude, longitude };
    this.#changed();
  }
}

/** The name of the city nearest to the coordinates, from GWeather's offline database. */
function nearestCityName(latitude: number, longitude: number): string | null {
  return GWeather.Location.get_world()?.find_nearest_city(latitude, longitude).get_name() ?? null;
}
