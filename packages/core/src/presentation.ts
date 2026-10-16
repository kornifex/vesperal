// Seam 2: turning a clock snapshot into what the front ends display.
import type { ClockSnapshot } from "./clock.ts";

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

/** The duration the clock displays. */
export type Reading = "remaining";

/** Translates an English source message; front ends inject gettext or an equivalent. */
export type Translate = (message: string) => string;

export interface PresentationOptions {
  readonly reading: Reading;
  /** IANA time zone in which Civil times are shown. */
  readonly timeZone: string;
  /** BCP 47 locale in which Civil times are shown. */
  readonly locale: string;
  readonly translate: Translate;
}

export interface Bar {
  /** The Reading, as a duration. */
  readonly text: string;
}

export interface ViewModel {
  readonly bar: Bar;
}

export function present(snapshot: ClockSnapshot, options: PresentationOptions): ViewModel {
  // Rounded up, so the clock never claims the Solar event has arrived before it has.
  const minutes = Math.ceil(snapshot.remaining / MS_PER_MINUTE);
  return { bar: { text: formatDuration(minutes, options.translate) } };
}

function formatDuration(totalMinutes: number, translate: Translate): string {
  if (totalMinutes < MINUTES_PER_HOUR) {
    return translate("{minutes} min").replace("{minutes}", String(totalMinutes));
  }
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return translate("{hours}h {minutes}m")
    .replace("{hours}", String(hours))
    .replace("{minutes}", String(minutes).padStart(2, "0"));
}
