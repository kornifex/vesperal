import { describe, expect, test } from "vitest";
import {
  type Location,
  NotificationSchedule,
  type NotificationSettings,
  readClock,
} from "./index.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const PARIS: Location = { latitude: 48.8566, longitude: 2.3522 };
// The Sunset of 21 June 2026 in Paris, at about 19:58 UTC, as the clock finds it: the schedule
// is tested against the clock's own events, whose accuracy the clock's tests establish.
const SUNSET = readClock(PARIS, new Date("2026-06-21T12:00:00Z")).phase.end.getTime();

const SUNSET_30_MINUTES_AHEAD: NotificationSettings = {
  events: ["sunset"],
  leadMinutes: 30,
  twilight: "civil",
};

/** A schedule that has already been ticked at `first`, as it is after its first minute. */
function scheduleTickedAt(first: number): NotificationSchedule {
  const schedule = new NotificationSchedule();
  schedule.due(new Date(first), PARIS, SUNSET_30_MINUTES_AHEAD);
  return schedule;
}

describe("NotificationSchedule", () => {
  test("on its first tick, announces the events to come within their lead time", () => {
    // As at login, or when the screen is unlocked after a suspend.
    const schedule = new NotificationSchedule();

    expect(schedule.due(new Date(SUNSET - 10 * MINUTE), PARIS, SUNSET_30_MINUTES_AHEAD)).toEqual([
      { event: "sunset", instant: new Date(SUNSET) },
    ]);
  });

  test("on its first tick, says nothing of events beyond their lead time or gone by", () => {
    expect(
      new NotificationSchedule().due(new Date(SUNSET - HOUR), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toEqual([]);
    expect(
      new NotificationSchedule().due(new Date(SUNSET + MINUTE), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toEqual([]);
  });

  test("announces an event on the tick that reaches its lead time", () => {
    const schedule = scheduleTickedAt(SUNSET - 31 * MINUTE + 1);

    expect(
      schedule.due(new Date(SUNSET - 30 * MINUTE - 1), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toEqual([]);
    expect(
      schedule.due(new Date(SUNSET - 29 * MINUTE - 1), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toEqual([{ event: "sunset", instant: new Date(SUNSET) }]);
    expect(
      schedule.due(new Date(SUNSET - 28 * MINUTE - 1), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toEqual([]);
  });

  test("announces an event at its very moment, with no lead time", () => {
    const atTheEvent: NotificationSettings = { ...SUNSET_30_MINUTES_AHEAD, leadMinutes: 0 };
    const schedule = new NotificationSchedule();
    schedule.due(new Date(SUNSET - MINUTE - 1), PARIS, atTheEvent);

    expect(schedule.due(new Date(SUNSET - 1), PARIS, atTheEvent)).toEqual([]);
    expect(schedule.due(new Date(SUNSET + MINUTE - 1), PARIS, atTheEvent)).toEqual([
      { event: "sunset", instant: new Date(SUNSET) },
    ]);
  });

  test("announces each event once, even when the lead time changes in between", () => {
    const schedule = scheduleTickedAt(SUNSET - 31 * MINUTE + 1);
    expect(
      schedule.due(new Date(SUNSET - 30 * MINUTE + 1), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toHaveLength(1);

    const later: NotificationSettings = { ...SUNSET_30_MINUTES_AHEAD, leadMinutes: 20 };
    for (let tick = SUNSET - 29 * MINUTE + 1; tick < SUNSET + 5 * MINUTE; tick += MINUTE) {
      expect(schedule.due(new Date(tick), PARIS, later)).toEqual([]);
    }
  });

  test("after a suspend, announces an event still to come", () => {
    const schedule = scheduleTickedAt(SUNSET - 3 * HOUR);

    expect(schedule.due(new Date(SUNSET - 10 * MINUTE), PARIS, SUNSET_30_MINUTES_AHEAD)).toEqual([
      { event: "sunset", instant: new Date(SUNSET) },
    ]);
  });

  test("after a suspend, says nothing of an event gone by, even a minute ago", () => {
    expect(
      scheduleTickedAt(SUNSET - 3 * HOUR).due(
        new Date(SUNSET + HOUR),
        PARIS,
        SUNSET_30_MINUTES_AHEAD,
      ),
    ).toEqual([]);
    expect(
      scheduleTickedAt(SUNSET - 3 * HOUR).due(
        new Date(SUNSET + MINUTE),
        PARIS,
        SUNSET_30_MINUTES_AHEAD,
      ),
    ).toEqual([]);
  });

  test("announces an event once, even when the Location or the Twilight moves it", () => {
    const schedule = scheduleTickedAt(SUNSET - 31 * MINUTE + 1);
    expect(
      schedule.due(new Date(SUNSET - 30 * MINUTE + 1), PARIS, SUNSET_30_MINUTES_AHEAD),
    ).toHaveLength(1);

    // A few hundred metres west, as an Automatic location may jitter: Sunset comes a little later.
    const westOfParis = { ...PARIS, longitude: PARIS.longitude - 0.005 };
    const duskToo: NotificationSettings = {
      ...SUNSET_30_MINUTES_AHEAD,
      events: ["sunset", "dusk"],
    };
    let dusks = 0;
    for (let tick = SUNSET - 29 * MINUTE + 1; tick < SUNSET + 2 * HOUR; tick += MINUTE) {
      // Dusk is announced once, though the Twilight changes after it was.
      const twilight = tick > SUNSET + 30 * MINUTE ? "nautical" : "civil";
      const due = schedule.due(new Date(tick), westOfParis, { ...duskToo, twilight });
      expect(due.filter(({ event }) => event === "sunset")).toEqual([]);
      dusks += due.length;
    }
    expect(dusks).toBe(1);
  });

  test("announces Dawn and Dusk only when they happen", () => {
    // In Paris in June, the Sun gets 6° below the horizon at night, but not 18°.
    const countOverOneDay = (twilight: NotificationSettings["twilight"]): number => {
      const settings: NotificationSettings = {
        events: ["dawn", "dusk"],
        leadMinutes: 30,
        twilight,
      };
      const schedule = scheduleTickedAt(SUNSET - 12 * HOUR);
      let count = 0;
      for (let tick = SUNSET - 12 * HOUR + MINUTE; tick <= SUNSET + 12 * HOUR; tick += MINUTE) {
        count += schedule.due(new Date(tick), PARIS, settings).length;
      }
      return count;
    };

    expect(countOverOneDay("civil")).toBe(2);
    expect(countOverOneDay("astronomical")).toBe(0);
  });

  test("announces only the chosen events, and none without a Location", () => {
    const schedule = scheduleTickedAt(SUNSET - 31 * MINUTE + 1);
    const sunriseOnly: NotificationSettings = { ...SUNSET_30_MINUTES_AHEAD, events: ["sunrise"] };

    expect(schedule.due(new Date(SUNSET - 30 * MINUTE + 1), PARIS, sunriseOnly)).toEqual([]);

    const unknown = scheduleTickedAt(SUNSET - 31 * MINUTE + 1);
    expect(unknown.due(new Date(SUNSET - 30 * MINUTE + 1), null, SUNSET_30_MINUTES_AHEAD)).toEqual(
      [],
    );
  });
});
