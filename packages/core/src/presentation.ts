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

/** The Sun arc: the Sun (during a Day) or the Moon (during a Night) placed at the Progress. */
export interface SunArc {
  readonly body: "sun" | "moon";
  /** From 0 (rising end of the arc) to 1 (setting end). */
  readonly progress: number;
}

export interface Bar {
  readonly arc: SunArc;
  /** The Reading, as a duration. */
  readonly text: string;
}

export interface ViewModel {
  readonly bar: Bar;
}

export function present(snapshot: ClockSnapshot, options: PresentationOptions): ViewModel {
  // Rounded up, so the clock never claims the Solar event has arrived before it has.
  const minutes = Math.ceil(snapshot.remaining / MS_PER_MINUTE);
  return {
    bar: {
      arc: {
        body: snapshot.phase.kind === "day" ? "sun" : "moon",
        progress: snapshot.progress,
      },
      text: formatDuration(minutes, options.translate),
    },
  };
}

function formatDuration(totalMinutes: number, translate: Translate): string {
  if (totalMinutes < MINUTES_PER_HOUR) {
    // Translators: a duration under one hour, e.g. "42 min".
    return fill(translate("{minutes} min"), { minutes: String(totalMinutes) });
  }
  // Translators: a duration over one hour, e.g. "3h 05m"; {minutes} always has two digits.
  return fill(translate("{hours}h {minutes}m"), {
    hours: String(Math.floor(totalMinutes / MINUTES_PER_HOUR)),
    minutes: String(totalMinutes % MINUTES_PER_HOUR).padStart(2, "0"),
  });
}

/** Replaces each `{name}` placeholder of a translated template. */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}
