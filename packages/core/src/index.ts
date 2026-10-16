// Solar computation and Phase model. Must never import GNOME libraries (see ADR 0001).
export { type ClockSnapshot, type Phase, type PhaseKind, readClock } from "./clock.ts";
export type { Location } from "./location.ts";
export {
  type Bar,
  type PresentationOptions,
  present,
  type Reading,
  type SunArc,
  type Translate,
  type ViewModel,
} from "./presentation.ts";
