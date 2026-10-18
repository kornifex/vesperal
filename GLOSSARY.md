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
The moment the Sun rises back above the Twilight altitude, before a Sunrise. There is none when the Sun does not get that far below the horizon in the Night before that Sunrise.
_Avoid_: Daybreak, first light

**Dusk**:
The moment the Sun sinks below the Twilight altitude, after a Sunset. There is none when the Sun does not get that far below the horizon in the Night after that Sunset.
_Avoid_: Nightfall, last light

## Phases

**Phase**:
The interval between two consecutive Solar events: either a Day or a Night.
_Avoid_: Period, half, segment

**Day**:
The Phase from a Sunrise to the following Sunset.
_Avoid_: Daytime, daylight

**Night**:
The Phase from a Sunset to the following Sunrise.
_Avoid_: Nighttime, darkness

**Polar day**:
A Day lasting longer than 24 hours.
_Avoid_: Midnight sun, endless day

**Polar night**:
A Night lasting longer than 24 hours.
_Avoid_: Endless night

**Day length**:
The duration of a Day.

**Night length**:
The duration of a Night.

## Reading the clock

**Reading**:
The duration the clock displays, chosen by the user: either Remaining time (the default) or Elapsed time.
_Avoid_: Display mode, view

**Remaining time**:
The duration from now until the end of the current Phase, i.e. until the next Solar event.
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

**Civil time**:
Ordinary clock time in the user's time zone, used only to tell when Solar events happen.
_Avoid_: Normal time, wall clock, real time

## The year

**Solstice**:
One of the two moments of the year when the Sun is furthest north or south of the celestial equator: around 21 June and 21 December. It brings the longest Day of the year to one hemisphere and the shortest to the other, so it is named by its month: the June solstice, the December solstice.
_Avoid_: Summer solstice, winter solstice (their meaning depends on the hemisphere)

**Equinox**:
One of the two moments of the year when the Sun crosses the celestial equator: around 20 March and 22 September. It is named by its month: the March equinox, the September equinox.
_Avoid_: Spring equinox, autumn equinox (their meaning depends on the hemisphere)

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
