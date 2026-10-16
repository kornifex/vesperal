// Solar computation and Phase model. Must never import GNOME libraries (see ADR 0001).
export { type ClockSnapshot, type Phase, type PhaseKind, readClock } from "./clock.ts";
export type { Location, LocationInUse, LocationSource } from "./location.ts";
export {
  type Bar,
  type Menu,
  type MenuRow,
  type PresentationOptions,
  present,
  presentLocationUnknown,
  READINGS,
  type Reading,
  type SunArc,
  type Translate,
  type ViewModel,
} from "./presentation.ts";
