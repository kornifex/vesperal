import Clutter from "gi://Clutter";
import St from "gi://St";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import type { MenuRow, ViewModel } from "@vesperal/core";
import type { SunArcPosition } from "./settings.ts";
import { SunArcIcon } from "./sunArcIcon.ts";

/** The panel indicator and its menu, rendering a view model. */
export class VesperalIndicator {
  readonly button: PanelMenu.Button;
  readonly #box = new St.BoxLayout({ style_class: "vesperal-indicator" });
  readonly #label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
  readonly #arcIcon = new SunArcIcon(this.#label);
  readonly #rows = new PopupMenu.PopupMenuSection();
  readonly #manualLocationEntry = new PopupMenu.PopupMenuItem("");

  constructor(
    name: string,
    actions: {
      preferences: { label: string; activate: () => void };
      manualLocationEntry: { activate: () => void };
      /** Run on a secondary click, which then does not open the menu. */
      secondaryClick: () => void;
    },
  ) {
    this.#box.add_child(this.#arcIcon.actor);
    this.#box.add_child(this.#label);
    this.button = new PanelMenu.Button(0.5, name);
    this.button.add_child(this.#box);
    // The button's own gesture opens the menu on a press of any button: keep it to the primary
    // one (touch counts as primary), and give the secondary one its own gesture.
    this.button._clickGesture.required_button = Clutter.BUTTON_PRIMARY;
    const secondaryClick = new Clutter.ClickGesture({
      required_button: Clutter.BUTTON_SECONDARY,
      recognize_on_press: true,
    });
    secondaryClick.connect("recognize", actions.secondaryClick);
    this.button.add_action(secondaryClick);

    const menu = this.button.menu as PopupMenu.PopupMenu;
    menu.addMenuItem(this.#rows);
    this.#manualLocationEntry.connect("activate", actions.manualLocationEntry.activate);
    menu.addMenuItem(this.#manualLocationEntry);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addAction(actions.preferences.label, actions.preferences.activate);
  }

  show(view: ViewModel): void {
    if (view.bar.arc) this.#arcIcon.arc = view.bar.arc;
    this.#arcIcon.actor.visible = view.bar.arc !== null;
    this.#label.text = view.bar.text;
    this.#showRows(view.menu.rows);
    this.#manualLocationEntry.label.text = view.menu.manualLocationEntry ?? "";
    this.#manualLocationEntry.visible = view.menu.manualLocationEntry !== null;
  }

  /** Puts the Sun arc on the given side of the Reading. */
  placeSunArc(position: SunArcPosition): void {
    this.#box.set_child_at_index(this.#arcIcon.actor, position === "left" ? 0 : 1);
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
        new St.Label({ text: label, x_expand: true, style_class: "vesperal-menu-label" }),
      );
      item.add_child(new St.Label({ text: value, style_class: "vesperal-menu-value" }));
      this.#rows.addMenuItem(item);
    }
  }
}
