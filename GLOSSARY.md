# Vesperal

A clock that tells time relative to the Sun at the user's Location rather than on a 24-hour dial: it shows how long remains until the next Solar event.

## Solar events

**Sunrise**:
The moment the upper limb of the Sun rises above the horizon, accounting for standard atmospheric refraction (solar altitude of −0.833°).
_Avoid_: Daybreak (Dawn is a different moment)

**Sunset**:
The moment the upper limb of the Sun sinks below the horizon, with the same convention as Sunrise.
_Avoid_: Nightfall (Dusk is a different moment)

**Solar event**:
A Sunrise or a Sunset.
_Avoid_: Transition, sun change

## Twilight

**Twilight**:
How far below the horizon the Sun's centre must be for Dawn and Dusk, chosen by the user: civil (6°, the default), nautical (12°) or astronomical (18°). Measured geometrically, without refraction.
_Avoid_: Twilight type, depth

**Dawn**:
The moment the Sun rises above the Twilight altitude, usually some time before a Sunrise. There is none before a Sunrise when the Sun does not get that far below the horizon after the Sunset before it.
_Avoid_: Daybreak, first light

**Dusk**:
The moment the Sun sinks below the Twilight altitude, usually some time after a Sunset. There is none after a Sunset when the Sun does not get that far below the horizon before the next Sunrise.
_Avoid_: Nightfall, last light

## Phases

**Phase bounds**:
The pair of events between which the clock counts, chosen by the user: Sunrise and Sunset (the default), or Dawn and Dusk. See ADR 0003.
_Avoid_: Bounds mode, counting mode

**Phase**:
The interval between two consecutive Phase bounds: either a Day or a Night.
_Avoid_: Period, half, segment

**Day**:
The Phase from a Sunrise to the following Sunset, or, with Dawn and Dusk as Phase bounds, from a Dawn to the following Dusk.
_Avoid_: Daytime, daylight

**Night**:
The Phase from a Sunset to the following Sunrise, or, with Dawn and Dusk as Phase bounds, from a Dusk to the following Dawn.
_Avoid_: Nighttime, darkness

**Polar day**:
The Sun staying above the horizon for longer than 24 hours. With Sunrise and Sunset as Phase bounds, it is a Day lasting longer than 24 hours; with Dawn and Dusk, it falls within such a Day.
_Avoid_: Midnight sun, endless day

**Polar night**:
A Night lasting longer than 24 hours. The Sun stays below the horizon all along, and with Dawn and Dusk as Phase bounds, below the Twilight altitude too.
_Avoid_: Endless night

**No dark night**:
With Dawn and Dusk as Phase bounds, a Day lasting longer than 24 hours although the Sun still sets: it does not get below the Twilight altitude between its Sunsets and Sunrises. It happens at mid-latitudes in summer with a nautical or astronomical Twilight.
_Avoid_: White night, midnight twilight

**Long Phase**:
A Phase lasting longer than 24 hours: a Polar night, a Polar day or a No dark night. The bar names it instead of showing a Reading over 24 hours.
_Avoid_: Polar state, long period

**Day length**:
The duration of a Day, between its Phase bounds.

**Night length**:
The duration of a Night, between its Phase bounds.

## Reading the clock

**Reading**:
What the clock displays, chosen by the user: the Remaining time (the default), the Elapsed time, or both, the Elapsed time first. When either of the two would exceed 24 hours, the Long Phase is named instead of both.
_Avoid_: Display mode, view

**Remaining time**:
The duration from now until the end of the current Phase, i.e. until the next Phase bound.
_Avoid_: Countdown, time left, time to go

**Elapsed time**:
The duration from the start of the current Phase until now.
_Avoid_: Time since, age

**Progress**:
The fraction of the current Phase already elapsed, from 0 to 1.
_Avoid_: Percentage, completion

**Sun arc**:
The visual representation of Progress: a half arc on which the Sun (during a Day) or the Moon (during a Night) sits at the current Progress. The part of the arc the Reading measures is emphasised: the way still ahead of the body for Remaining time, the way already behind it for Elapsed time.
_Avoid_: Progress bar, gauge

**Moon phase**:
How much of the Moon's disc is lit, and whether that part is growing (waxing, from New Moon to Full Moon) or shrinking (waning). The Moon on the Sun arc shows it, lit on the side of the Sun as seen from the Location's hemisphere: on the right of a waxing Moon in the northern hemisphere, on its left in the southern one.
_Avoid_: Lunar phase, Moon age

**Civil time**:
Ordinary clock time in the user's time zone, used only to tell when Solar events happen. It is shown as the desktop clock shows it, in 12-hour or 24-hour format.
_Avoid_: Normal time, wall clock, real time

## The year

**Solstice**:
One of the two moments of the year when the Sun is furthest north or south of the celestial equator: around 21 June and 21 December. It brings the longest Day of the year to one hemisphere and the shortest to the other, so it is named by its month: the June solstice, the December solstice.
_Avoid_: Summer solstice, winter solstice (their meaning depends on the hemisphere)

**Equinox**:
One of the two moments of the year when the Sun crosses the celestial equator: around 20 March and 22 September. It is named by its month: the March equinox, the September equinox.
_Avoid_: Spring equinox, autumn equinox (their meaning depends on the hemisphere)

## Notifications

**Notification**:
A message the desktop shows a chosen number of minutes (the lead time) before a Dawn, a Sunrise, a Sunset or a Dusk, for the events the user chose. Each event is announced once.
_Avoid_: Alert, reminder, alarm

## Location

**Location**:
The geographic coordinates for which Solar events are computed.
_Avoid_: Position, place, coordinates

**Automatic location**:
A Location provided by the system's location service.

**Manual location**:
A Location entered by the user.

**Last known location**:
The most recent Automatic location successfully obtained, kept for when no Location is currently available.
_Avoid_: Cached location
