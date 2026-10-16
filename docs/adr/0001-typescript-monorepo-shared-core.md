# TypeScript monorepo with a GNOME-free core

The first front end is a GNOME Shell extension, which must run as JavaScript under GJS; a CLI will follow. We write everything in TypeScript in a monorepo (`core`, `gnome-extension`, later `cli`) so the exact same solar computation runs unchanged in both front ends. `core` must never import GNOME libraries, so it can be tested under Node and reused by any front end.

## Considered Options

- **Rust core + Rust CLI**: a natural fit for a CLI, but the extension could only reach it through a subprocess or a D-Bus service, adding a moving part to the very thing that must stay simple.
- **Plain JavaScript**: fewer build steps, but rejected because a very clean, strictly typed codebase is an explicit goal.
