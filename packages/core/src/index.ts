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
export { type MoonPhase, moonPhase } from "./moon.ts";
export {
  type DueNotification,
  NOTIFIABLE_EVENTS,
  type NotifiableEvent,
  NotificationSchedule,
  type NotificationSettings,
} from "./notifications.ts";
export {
  BAR_CONTENTS,
  type Bar,
  type BarContent,
  type Menu,
  type MenuRow,
  type MoonOnArc,
  type NotificationPresentationOptions,
  type NotificationView,
  type PresentationOptions,
  present,
  presentError,
  presentLocationUnknown,
  presentNotification,
  READINGS,
  type Reading,
  type SunArc,
  type Translate,
  type TranslatePlural,
  type ViewModel,
} from "./presentation.ts";
export {
  dayLengthsByDate,
  readYear,
  type SolsticeOrEquinox,
  solsticesAndEquinoxes,
  type YearReading,
} from "./year.ts";
export {
  presentYear,
  type YearMonth,
  type YearPresentationOptions,
  type YearView,
} from "./yearPresentation.ts";
