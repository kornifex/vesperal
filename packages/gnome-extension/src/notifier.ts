import type Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { NotifiableEvent, NotificationView } from "@vesperal/core";

/** The icon of each event's notifications: a rising Sun for the morning, a setting one after. */
const ICONS: Readonly<Record<NotifiableEvent, string>> = {
  dawn: "daytime-sunrise-symbolic",
  sunrise: "daytime-sunrise-symbolic",
  sunset: "daytime-sunset-symbolic",
  dusk: "daytime-sunset-symbolic",
};

/**
 * Sends notifications through GNOME Shell's message tray, as a source of their own, so that
 * they follow Do Not Disturb and the system notification settings like any other.
 */
export class Notifier {
  readonly #title: string;
  readonly #icon: Gio.Icon;
  // The message tray destroys a source once its last notification is gone: a new one is
  // created for the next notification.
  #source: MessageTray.Source | null = null;

  /** Notifies as a source named `title`, shown with `icon`. */
  constructor(title: string, icon: Gio.Icon) {
    this.#title = title;
    this.#icon = icon;
  }

  notify(event: NotifiableEvent, view: NotificationView): void {
    const source = this.#sourceToNotify();
    source.addNotification(
      new MessageTray.Notification({
        source,
        title: view.title,
        body: view.body,
        iconName: ICONS[event],
      }),
    );
  }

  /** Withdraws the notifications still shown. */
  destroy(): void {
    this.#source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    this.#source = null;
  }

  #sourceToNotify(): MessageTray.Source {
    if (this.#source) return this.#source;
    const source = new MessageTray.Source({ title: this.#title, icon: this.#icon });
    source.connect("destroy", () => {
      if (this.#source === source) this.#source = null;
    });
    Main.messageTray.add(source);
    this.#source = source;
    return source;
  }
}
