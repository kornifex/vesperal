// When to notify the user ahead of Dawn, Sunrise, Sunset and Dusk.
import { type AltitudeCrossings, solarEventCrossings, type Twilight } from "./clock.ts";
import type { Location } from "./location.ts";
import { MS_PER_MINUTE } from "./time.ts";

/** Every event the user can be notified of, in the order of a day. */
export const NOTIFIABLE_EVENTS = ["dawn", "sunrise", "sunset", "dusk"] as const;

/** Dawn, a Sunrise, a Sunset or Dusk. */
export type NotifiableEvent = (typeof NOTIFIABLE_EVENTS)[number];

export interface NotificationSettings {
  /** The events to notify of; none switches notifications off. */
  readonly events: readonly NotifiableEvent[];
  /** How long before each event to notify of it, in minutes; 0 notifies at the event. */
  readonly leadMinutes: number;
  /** The Twilight that Dawn and Dusk follow. */
  readonly twilight: Twilight;
}

/** An event to notify of now. */
export interface DueNotification {
  readonly event: NotifiableEvent;
  readonly instant: Date;
}

// The clock ticks every minute, sometimes a little late. An event further in the past than
// this is stale, as after a suspend, and goes unannounced.
const STALE_AFTER_MS = 2 * MS_PER_MINUTE;
// Two events of the same kind are about a day apart: within this, two instants of one kind are
// the same event, moved as the Location or the Twilight changed.
const SAME_EVENT_WITHIN_MS = 6 * 60 * MS_PER_MINUTE;

/**
 * Decides, minute tick after minute tick, which events to notify of: each one once, on the
 * first tick at or after its lead time, or on the first tick after a gap (such as a suspend,
 * or the screen being locked) if it is still to come. It remembers the previous tick and the
 * events already notified of, so that neither a gap nor a change of settings ever announces an
 * event twice.
 */
export class NotificationSchedule {
  #previousTick: number | null = null;
  #notified: DueNotification[] = [];

  /**
   * The events to notify of at the tick `now`, for `location` (none when it is unknown) and
   * the current settings.
   */
  due(now: Date, location: Location | null, settings: NotificationSettings): DueNotification[] {
    const previous = this.#previousTick;
    const nowMs = now.getTime();
    this.#previousTick = nowMs;
    this.#notified = this.#notified.filter(
      ({ instant }) => instant.getTime() > nowMs - SAME_EVENT_WITHIN_MS,
    );
    if (!location || settings.events.length === 0) return [];

    // Due: an event whose lead time has come in since the previous tick, or, on a first tick,
    // any event within its lead time; either way one still to come, or with no lead time, one
    // that has only just come.
    const lead = settings.leadMinutes * MS_PER_MINUTE;
    const notBefore = lead > 0 || previous === null ? nowMs : nowMs - STALE_AFTER_MS;
    const from = previous === null ? notBefore : Math.max(previous + lead, notBefore);
    const due = eventsBetween(location, settings, from, nowMs + lead).filter(
      (candidate) => !this.#notified.some((notified) => isSameEvent(notified, candidate)),
    );
    this.#notified.push(...due);
    return due;
  }
}

function isSameEvent(a: DueNotification, b: DueNotification): boolean {
  return (
    a.event === b.event &&
    Math.abs(a.instant.getTime() - b.instant.getTime()) < SAME_EVENT_WITHIN_MS
  );
}

/** The chosen events after `from` and up to `to` (milliseconds since the epoch), in order. */
function eventsBetween(
  location: Location,
  settings: NotificationSettings,
  from: number,
  to: number,
): DueNotification[] {
  const { horizon, twilight } = solarEventCrossings(location, settings.twilight);
  const altitudes: {
    crossings: AltitudeCrossings;
    rising: NotifiableEvent;
    falling: NotifiableEvent;
  }[] = [
    { crossings: horizon, rising: "sunrise", falling: "sunset" },
    { crossings: twilight, rising: "dawn", falling: "dusk" },
  ];
  const events: DueNotification[] = [];
  for (const { crossings, rising, falling } of altitudes) {
    if (!settings.events.includes(rising) && !settings.events.includes(falling)) continue;
    for (let instant = crossings.earliestAfter(from); instant <= to; ) {
      const event = crossings.isAbove(instant) ? rising : falling;
      if (settings.events.includes(event)) events.push({ event, instant: new Date(instant) });
      instant = crossings.earliestAfter(instant);
    }
  }
  return events.sort((a, b) => a.instant.getTime() - b.instant.getTime());
}
