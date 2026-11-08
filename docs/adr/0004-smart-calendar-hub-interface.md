# What Smart Calendar Hub relies on is an interface

[Smart Calendar Hub](https://github.com/bria-bria/smart-calendar-hub) is a GNOME Shell extension that turns the clock menu into a side panel. It integrates Vesperal without any change on our side (issue #5): a click on its sun and moon opens Vesperal's menu inside the panel, Vesperal's preferences are rebuilt in a card beside the panel, and Vesperal's own icon can be hidden. To do that, it reaches into details we never published as an interface. We treat those details as a public interface from now on: before changing one, we weigh the breakage, and we name any change in the changelog.

## What it relies on

- **The status area role**: the indicator is found as `Main.panel.statusArea['vesperal@kornifex.github.io']`, the role `extension.ts` passes to `addToPanel` (the extension's UUID). The hub uses its `menu`, and hides and shows its `container`.
- **The GSettings keys**, read and written with their current types and values: `location-mode`, `manual-location` and `last-known-location` (`m(sdd)`), `twilight`, `phase-bounds`, `notifications`, `notification-events`, `notification-lead-time`, `bar-content`, `sun-arc-position` and `indicator-position`. The hub reads the allowed values of each enum from our schema, but its labels for them are written in its own code, so a new value shows there without a label.
- **Two menu labels**: the hub finds the menu items it replaces by their gettext `msgid` in the `vesperal` domain, "Preferences" (`extension.ts`) and "Set a location manually…" (`presentation.ts`). Rewording either one silently stops the hub from taking them over.

The hub checks that a key exists before reading it, so a key that is missing, as in version 2, only hides a setting from its card.

## Considered Options

- **Change these details freely**: rejected. A user who has both extensions would see the hub break after one of our updates, with nothing on either side to explain why.
- **Treat them as an interface**: chosen. Nothing changes in the code, only the care we take before a rename, a type change or a reworded label.
- **Offer an explicit hook**, such as the `smartCalendarHub` object the hub reads on a panel button: proposed to the hub's authors in issue #5, not done unless they ask for it. It would replace the matching of labels, the most fragile of the three.

## Consequences

- Renaming or removing one of these keys, changing its type, or rewording one of the two labels is a breaking change for the hub: it goes in the changelog, and we tell the hub's authors.
- Adding a value to one of these enums is fine, but leaves the hub without a label for it until it catches up.
- The role stays the UUID.
