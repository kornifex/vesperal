# Sun Clock

A clock that tells time relative to sunrise and sunset at your location. Working name; see `GLOSSARY.md` for the domain language and `docs/adr/` for design decisions.

## Packages

- `packages/core`: solar computation and Phase model, free of any GNOME dependency.
- `packages/gnome-extension`: GNOME Shell extension (GNOME 50).

## Development

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm check                               # lint + typecheck + tests (also runs as a pre-commit hook)
pnpm format                              # apply Biome formatting
pnpm build                               # bundle the extension into packages/gnome-extension/dist
pnpm --filter @sun-clock/gnome-extension install-extension   # build and install locally
pnpm --filter @sun-clock/gnome-extension update-po           # refresh po/ after changing messages
```

User-visible strings are written in English and translated with gettext (`packages/gnome-extension/po/`). `pnpm check` fails if a message lacks a French translation.

## License

GPL-3.0-or-later.
