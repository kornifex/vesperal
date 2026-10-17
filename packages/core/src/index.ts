// Solar computation and its presentation. Must never import GNOME libraries (see ADR 0001).
export {
  type ClockSnapshot,
  type Phase,
  type PhaseKind,
  readClock,
  TWILIGHTS,
  type Twilight,
} from "./clock.ts";
export {
  isValidLocation,
  LOCATION_MODES,
  type Location,
  type LocationInUse,
  type LocationMode,
  type LocationSource,
  type NamedLocation,
  resolveLocation,
} from "./location.ts";
export {
  type Bar,
  type Menu,
  type MenuRow,
  type PresentationOptions,
  present,
  presentError,
  presentLocationUnknown,
  READINGS,
  type Reading,
  type SunArc,
  type Translate,
  type ViewModel,
} from "./presentation.ts";
