import Clutter from "gi://Clutter";
import Pango from "gi://Pango";
import St from "gi://St";
import type { SunArc } from "@vesperal/core";
import Cairo from "cairo";

// How the part of the arc the Reading does not measure is drawn, relative to the rest.
const FADED_WIDTH = 0.6;
const FADED_OPACITY = 0.4;
// The arc is a flattened half ellipse: its height as a fraction of its half-width.
const ARC_FLATNESS = 0.55;
// How far the horizon runs past each end of the arc, as a fraction of the body's radius.
const HORIZON_OVERHANG = 0.6;

/**
 * Draws the Sun arc in the panel's foreground colour, so it renders like a symbolic icon:
 * a horizon, a flattened half arc above it, and the Sun or the Moon at the current Progress.
 *
 * The horizon lies on the baseline of `text`, so the Reading stands on the same ground as the
 * Sun whatever the font; the drawing area spans the full height of the bar to allow it. When
 * `text` is hidden, the drawing is centred in the bar instead.
 */
export class SunArcIcon {
  readonly actor = new St.DrawingArea({
    style_class: "vesperal-arc",
    y_align: Clutter.ActorAlign.FILL,
  });
  readonly #text: St.Label;
  #arc: SunArc | null = null;

  constructor(text: St.Label) {
    this.#text = text;
    // Tracked on the actor itself, so the handlers go with it when it is destroyed.
    this.actor.connectObject(
      "repaint",
      () => this.#repaint(),
      "style-changed",
      () => this.actor.queue_repaint(),
      this.actor,
    );
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

    // Sized on the width, so the drawing does not grow with the height of the bar; the arc is
    // flattened to stay low beside the text, within the room above the baseline.
    const lineWidth = Math.max(1, width / 18);
    const bodyRadius = width / 7;
    const centreX = width / 2;
    const radiusX = centreX - bodyRadius - lineWidth;
    const horizonY = this.#text.visible
      ? Math.min(this.#baselineY() ?? height, height) - lineWidth / 2
      : (height + radiusX * ARC_FLATNESS + bodyRadius + lineWidth) / 2;
    const radiusY = Math.min(radiusX * ARC_FLATNESS, horizonY - bodyRadius - lineWidth);

    // The horizon runs a little past each end of the arc.
    const horizonHalfLength = radiusX + bodyRadius * HORIZON_OVERHANG;
    cr.setLineWidth(lineWidth);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.moveTo(centreX - horizonHalfLength, horizonY);
    cr.lineTo(centreX + horizonHalfLength, horizonY);
    cr.stroke();

    // Cairo angles grow clockwise on screen: π is the rising end of the arc, 2π the setting end.
    const angle = Math.PI * (1 + arc.progress);

    // The part the Reading measures is drawn in full, the other part thin and faded.
    const strokeArc = (from: number, to: number, emphasised: boolean): void => {
      cr.setLineWidth(emphasised ? lineWidth : Math.max(1, lineWidth * FADED_WIDTH));
      setOpacity(emphasised ? 1 : FADED_OPACITY);
      // Scale a unit circle into the ellipse, then stroke unscaled so the line keeps its width.
      cr.save();
      cr.translate(centreX, horizonY);
      cr.scale(radiusX, radiusY);
      cr.arc(0, 0, 1, from, to);
      cr.restore();
      cr.stroke();
    };
    strokeArc(Math.PI, angle, arc.emphasis === "behind");
    strokeArc(angle, 2 * Math.PI, arc.emphasis === "ahead");
    setOpacity(1);

    const bodyX = centreX + radiusX * Math.cos(angle);
    const bodyY = horizonY + radiusY * Math.sin(angle);

    // A transparent ring keeps the body distinct from the arc it sits on.
    cr.setOperator(Cairo.Operator.CLEAR);
    cr.arc(bodyX, bodyY, bodyRadius + lineWidth, 0, 2 * Math.PI);
    cr.fill();
    cr.setOperator(Cairo.Operator.OVER);

    // The body is drawn in a group of its own, so that carving the Moon's crescent clears only
    // the disc: clearing through an antialiased clip would leave a faint sliver of its edge.
    cr.pushGroup();
    cr.arc(bodyX, bodyY, bodyRadius, 0, 2 * Math.PI);
    cr.fill();
    if (arc.body === "moon") {
      cr.setOperator(Cairo.Operator.CLEAR);
      cr.arc(bodyX + bodyRadius * 0.5, bodyY - bodyRadius * 0.35, bodyRadius * 0.8, 0, 2 * Math.PI);
      cr.fill();
    }
    cr.popGroupToSource();
    cr.paint();

    cr.$dispose();
  }

  /**
   * The baseline of the text, from the top of the drawing area, if the text is laid out. The
   * text and the drawing area are siblings, so their allocations share the same origin.
   */
  #baselineY(): number | undefined {
    const text = this.#text.clutter_text;
    if (!text.has_allocation() || !this.actor.has_allocation()) return undefined;
    const labelY = this.#text.get_allocation_box().y1;
    const textY = labelY + text.get_allocation_box().y1;
    const areaY = this.actor.get_allocation_box().y1;
    return textY - areaY + text.get_layout().get_baseline() / Pango.SCALE;
  }
}
