import Adw from "gi://Adw";
import type Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import PangoCairo from "gi://PangoCairo";
import type { YearView } from "@vesperal/core";
import type Cairo from "cairo";

const HEIGHT = 220;
// Room around the plot, in pixels, besides the labels of the axes.
const PADDING = 6;
// The hours of the Day length the grid marks, from none to all 24.
const GRID_HOURS = [0, 6, 12, 18, 24];
const GRID_OPACITY = 0.12;
const LABEL_OPACITY = 0.6;
const AREA_OPACITY = 0.25;
const CURVE_WIDTH = 2;
const MARKER_RADIUS = 3;
const TODAY_RADIUS = 5;

/**
 * Draws the Day length through the year: a curve over the dates, in the accent colour, with the
 * hours up the side and the months along the bottom, the Solstices and Equinoxes as dots on the
 * curve, and today marked by a line and a larger dot. The rest follows the foreground colour,
 * so the chart reads in light and dark styles alike.
 */
export class YearChart {
  readonly widget = new Gtk.DrawingArea({
    content_height: HEIGHT,
    hexpand: true,
    css_classes: ["caption"],
  });
  #view: YearView | null = null;
  readonly #styleManager = Adw.StyleManager.get_default();
  readonly #styleChangedIds: number[];

  constructor() {
    this.widget.set_draw_func((_area, cr, width, height) => {
      try {
        if (this.#view) this.#draw(this.#view, cr, width, height);
      } finally {
        cr.$dispose();
      }
    });
    this.#styleChangedIds = ["notify::accent-color", "notify::dark", "notify::high-contrast"].map(
      (signal) => this.#styleManager.connect(signal, () => this.widget.queue_draw()),
    );
  }

  set view(view: YearView) {
    this.#view = view;
    this.widget.queue_draw();
  }

  /** Stops following the style. */
  disconnect(): void {
    for (const id of this.#styleChangedIds) this.#styleManager.disconnect(id);
  }

  #draw(view: YearView, cr: Cairo.Context, width: number, height: number): void {
    const foreground = this.widget.get_color();
    // The accent colour meant for lines and text, rather than for backgrounds.
    const accent = Adw.accent_color_to_standalone_rgba(
      this.#styleManager.accent_color,
      this.#styleManager.dark,
    );
    const paint = (color: Gdk.RGBA, opacity = 1): void =>
      cr.setSourceRGBA(color.red, color.green, color.blue, color.alpha * opacity);

    const hourLabels = GRID_HOURS.map((hours) => this.widget.create_pango_layout(String(hours)));
    const monthLabels = view.months.map(({ label }) => this.widget.create_pango_layout(label));
    const sizeOf = (layout: (typeof hourLabels)[number]): { width: number; height: number } => {
      const [labelWidth, labelHeight] = layout.get_pixel_size();
      return { width: labelWidth, height: labelHeight };
    };
    const hourLabelWidth = Math.max(...hourLabels.map((layout) => sizeOf(layout).width));
    const hourLabelHeight = Math.max(...hourLabels.map((layout) => sizeOf(layout).height));
    const monthLabelHeight = Math.max(...monthLabels.map((layout) => sizeOf(layout).height));

    const left = hourLabelWidth + 2 * PADDING;
    // The hour labels are centred on their lines, so the top one reaches above the plot.
    const top = PADDING + hourLabelHeight / 2;
    const plotWidth = width - left - PADDING;
    const plotHeight = height - top - monthLabelHeight - 2 * PADDING;
    const dates = view.curve.length;
    const x = (index: number): number => left + ((index + 0.5) / dates) * plotWidth;
    const y = (fraction: number): number => top + (1 - fraction) * plotHeight;
    const pointOf = (index: number): [number, number] => [x(index), y(view.curve[index] ?? 0)];

    // The grid and its labels: hours up the side, months along the bottom.
    cr.setLineWidth(1);
    GRID_HOURS.forEach((hours, index) => {
      const lineY = Math.round(y(hours / 24)) + 0.5;
      paint(foreground, GRID_OPACITY);
      cr.moveTo(left, lineY);
      cr.lineTo(left + plotWidth, lineY);
      cr.stroke();
      const label = hourLabels[index];
      if (!label) return;
      const size = sizeOf(label);
      paint(foreground, LABEL_OPACITY);
      cr.moveTo(left - PADDING - size.width, lineY - size.height / 2);
      PangoCairo.show_layout(cr, label);
    });
    view.months.forEach(({ index }, month) => {
      const tickX = Math.round(left + (index / dates) * plotWidth) + 0.5;
      paint(foreground, GRID_OPACITY);
      cr.moveTo(tickX, top);
      cr.lineTo(tickX, top + plotHeight);
      cr.stroke();
      // Each month's label is centred on its span of dates.
      const label = monthLabels[month];
      if (!label) return;
      const end = view.months[month + 1]?.index ?? dates;
      const centreX = left + ((index + end) / 2 / dates) * plotWidth;
      paint(foreground, LABEL_OPACITY);
      cr.moveTo(centreX - sizeOf(label).width / 2, top + plotHeight + PADDING);
      PangoCairo.show_layout(cr, label);
    });

    // The curve, over an area filled down to a Day length of none.
    const tracePath = (): void => {
      view.curve.forEach((_fraction, index) => {
        const [pointX, pointY] = pointOf(index);
        if (index === 0) cr.moveTo(pointX, pointY);
        else cr.lineTo(pointX, pointY);
      });
    };
    tracePath();
    cr.lineTo(x(dates - 1), y(0));
    cr.lineTo(x(0), y(0));
    cr.closePath();
    paint(accent, AREA_OPACITY);
    cr.fill();
    tracePath();
    paint(accent);
    cr.setLineWidth(CURVE_WIDTH);
    cr.stroke();

    // Today: a line across the plot, and a dot on the curve.
    const [todayX, todayY] = pointOf(view.today);
    paint(foreground, LABEL_OPACITY);
    cr.setLineWidth(1);
    cr.moveTo(Math.round(todayX) + 0.5, top);
    cr.lineTo(Math.round(todayX) + 0.5, top + plotHeight);
    cr.stroke();

    paint(foreground);
    for (const index of view.solsticesAndEquinoxes) {
      const [markerX, markerY] = pointOf(index);
      cr.arc(markerX, markerY, MARKER_RADIUS, 0, 2 * Math.PI);
      cr.fill();
    }

    cr.arc(todayX, todayY, TODAY_RADIUS, 0, 2 * Math.PI);
    paint(accent);
    cr.fillPreserve();
    paint(foreground);
    cr.setLineWidth(CURVE_WIDTH);
    cr.stroke();
  }
}
