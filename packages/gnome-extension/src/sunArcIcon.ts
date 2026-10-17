import Clutter from "gi://Clutter";
import St from "gi://St";
import type { SunArc } from "@sun-clock/core";
import Cairo from "cairo";

// How the part of the arc the Reading does not measure is drawn, relative to the rest.
const FADED_WIDTH = 0.6;
const FADED_OPACITY = 0.4;

/**
 * Draws the Sun arc in the panel's foreground colour, so it renders like a symbolic icon:
 * a horizon, a half arc above it, and the Sun or the Moon at the current Progress.
 */
export class SunArcIcon {
  readonly actor = new St.DrawingArea({
    style_class: "sun-clock-arc",
    y_align: Clutter.ActorAlign.CENTER,
  });
  #arc: SunArc | null = null;

  constructor() {
    this.actor.connect("repaint", () => this.#repaint());
    this.actor.connect("style-changed", () => this.actor.queue_repaint());
  }

  set arc(arc: SunArc) {
    this.#arc = arc;
    this.actor.queue_repaint();
  }

  #repaint(): void {
    const arc = this.#arc;
    if (!arc) return;

    const [width, height] = this.actor.get_surface_size();
    const { red, green, blue, alpha } = this.actor.get_theme_node().get_foreground_color();
    const cr = this.actor.get_context();
    const setOpacity = (opacity: number): void =>
      cr.setSourceRGBA(red / 255, green / 255, blue / 255, (alpha / 255) * opacity);
    setOpacity(1);

    const lineWidth = Math.max(1, height / 10);
    const bodyRadius = height * 0.25;
    const horizonY = height - lineWidth / 2;
    const centreX = width / 2;
    const radius = Math.min(centreX - bodyRadius - lineWidth, horizonY - bodyRadius - lineWidth);

    cr.setLineWidth(lineWidth);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.moveTo(lineWidth / 2, horizonY);
    cr.lineTo(width - lineWidth / 2, horizonY);
    cr.stroke();

    // Cairo angles grow clockwise on screen: π is the rising end of the arc, 2π the setting end.
    const angle = Math.PI * (1 + arc.progress);

    // The part the Reading measures is drawn in full, the other part thin and faded.
    const strokeArc = (from: number, to: number, emphasised: boolean): void => {
      cr.setLineWidth(emphasised ? lineWidth : Math.max(1, lineWidth * FADED_WIDTH));
      setOpacity(emphasised ? 1 : FADED_OPACITY);
      cr.arc(centreX, horizonY, radius, from, to);
      cr.stroke();
    };
    strokeArc(Math.PI, angle, arc.emphasis === "behind");
    strokeArc(angle, 2 * Math.PI, arc.emphasis === "ahead");
    setOpacity(1);

    const bodyX = centreX + radius * Math.cos(angle);
    const bodyY = horizonY + radius * Math.sin(angle);

    // A transparent ring keeps the body distinct from the arc it sits on.
    cr.setOperator(Cairo.Operator.CLEAR);
    cr.arc(bodyX, bodyY, bodyRadius + lineWidth, 0, 2 * Math.PI);
    cr.fill();
    cr.setOperator(Cairo.Operator.OVER);
    cr.arc(bodyX, bodyY, bodyRadius, 0, 2 * Math.PI);
    cr.fill();

    if (arc.body === "moon") {
      // Carve a crescent out of the disc.
      cr.arc(bodyX, bodyY, bodyRadius, 0, 2 * Math.PI);
      cr.clip();
      cr.setOperator(Cairo.Operator.CLEAR);
      cr.arc(bodyX + bodyRadius * 0.5, bodyY - bodyRadius * 0.35, bodyRadius * 0.8, 0, 2 * Math.PI);
      cr.fill();
    }

    cr.$dispose();
  }
}
