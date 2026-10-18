# Phase bounds: a setting, not a new Reading

Some users want to know how long it stays light enough outside, which ends at Dusk rather than at Sunset. We let the user choose the Phase bounds: Sunrise and Sunset (the default), or Dawn and Dusk of the chosen Twilight. With Dawn and Dusk, a Day runs from a Dawn to the following Dusk, and a Night from that Dusk to the next Dawn. The Readings, Progress, the Sun arc, the Day length, its trend and the Year chart all count between the chosen bounds.

## Considered Options

- **A new Reading, "Remaining time until Dusk"**: rejected. It answers only the evening question, and only for one of the two Readings. The Sun arc, Elapsed time, the Day length, its trend and the Year chart would still count from Sunrise to Sunset, so the indicator and the menu would tell two stories at once.
- **A setting that redefines the Phase**: chosen. Day and Night are defined once, through their bounds, and every Reading and every view follows without knowing which bounds are in use. It also keeps Phase boundaries available to any future Reading, as ADR 0002 asks.

## Consequences

- Day, Night, Day length and Polar night are defined by the Phase bounds, no longer by Sunrise and Sunset.
- With Dawn and Dusk, the Twilight sets the length of every Phase, not only the Dawn and Dusk shown in the menu. With a nautical or astronomical Twilight, the Sun may not get below the Twilight altitude for weeks, even at mid-latitudes in summer: a Day then lasts longer than 24 hours although the Sun still sets every day. The bar shows "No dark night" for it, under the same 24-hour rule as a Polar day, and "Polar day" while the Sun stays above the horizon.
- The menu keeps listing Dawn, Sunrise, Sunset and Dusk in the order they happen, whichever two of them bound the Phase.
- Notifications are about events, not Phases, so they do not depend on the Phase bounds.
