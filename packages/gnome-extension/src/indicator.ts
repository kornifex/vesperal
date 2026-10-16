import Clutter from "gi://Clutter";
import St from "gi://St";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import type { MenuRow, ViewModel } from "@sun-clock/core";
import { SunArcIcon } from "./sunArcIcon.ts";

/** The panel indicator and its menu, rendering a view model. */
export class SunClockIndicator {
  readonly button: PanelMenu.Button;
  readonly #arcIcon = new SunArcIcon();
  readonly #label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
  readonly #rows = new PopupMenu.PopupMenuSection();

  constructor(name: string, actions: { preferences: { label: string; activate: () => void } }) {
    const box = new St.BoxLayout({ style_class: "sun-clock-indicator" });
    box.add_child(this.#arcIcon.actor);
    box.add_child(this.#label);
    this.button = new PanelMenu.Button(0.5, name);
    this.button.add_child(box);

    const menu = this.button.menu as PopupMenu.PopupMenu;
    menu.addMenuItem(this.#rows);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addAction(actions.preferences.label, actions.preferences.activate);
  }

  show(view: ViewModel): void {
    this.#arcIcon.arc = view.bar.arc;
    this.#label.text = view.bar.text;
    this.#showRows(view.menu.rows);
    this.button.show();
  }

  hide(): void {
    this.button.hide();
  }

  destroy(): void {
    this.button.destroy();
  }

  #showRows(rows: readonly MenuRow[]): void {
    this.#rows.removeAll();
    for (const { label, value } of rows) {
      // Informative rows: not dimmed like insensitive items, but never highlighted or activated.
      const item = new PopupMenu.PopupBaseMenuItem({
        activate: false,
        hover: false,
        can_focus: false,
      });
      item.add_child(
        new St.Label({ text: label, x_expand: true, style_class: "sun-clock-menu-label" }),
      );
      item.add_child(new St.Label({ text: value, style_class: "sun-clock-menu-value" }));
      this.#rows.addMenuItem(item);
    }
  }
}
