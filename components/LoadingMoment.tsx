"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Anvil, Axe, Battery, BatteryCharging, Bolt, Boxes, Brush, Calculator, Car, Clipboard, ClipboardList,
  Coffee, Cog, Compass, Drill, Droplets, Fan, Flame, Flashlight, Footprints, Gauge, Hammer, HardHat,
  Hourglass, Key, Lightbulb, Magnet, MapPin, Nut, Package, Paintbrush, PaintRoller, PencilRuler, Phone,
  Pickaxe, Plug, Receipt, Route, Ruler, Scissors, Shovel, Snowflake, Sparkles, Sun, Sunrise, Thermometer,
  Timer, Tractor, Truck, Waves, Wind, Wrench, Zap,
} from "lucide-react";
import { pickMoment, type Moment, type MomentIcon } from "@/lib/loading-moments";

const ICONS: Record<MomentIcon, LucideIcon> = {
  Anvil, Axe, Battery, BatteryCharging, Bolt, Boxes, Brush, Calculator, Car, Clipboard, ClipboardList,
  Coffee, Cog, Compass, Drill, Droplets, Fan, Flame, Flashlight, Footprints, Gauge, Hammer, HardHat,
  Hourglass, Key, Lightbulb, Magnet, MapPin, Nut, Package, Paintbrush, PaintRoller, PencilRuler, Phone,
  Pickaxe, Plug, Receipt, Route, Ruler, Scissors, Shovel, Snowflake, Sparkles, Sun, Sunrise, Thermometer,
  Timer, Tractor, Truck, Waves, Wind, Wrench, Zap,
};

/** A page that arrives faster than this never shows the moment (no flash). */
const SHOW_AFTER_MS = 140;
/** On a slow network the line changes so the wait still reads as alive. */
const ROTATE_MS = 3600;

/**
 * The pill that floats over a page skeleton while the next page loads: a
 * tool icon drawing itself in the company's primary color, one line in a
 * tech's voice, and a running bar. Different every time (lib/loading-moments).
 *
 * Sits inside the skeleton's root (which is `relative`), so on a desktop it
 * centers on the content column, not the viewport; `pointer-events: none` so
 * it never blocks a tap that lands early. Styles: app/ds.css ".wb-moment".
 */
export default function LoadingMoment() {
  const [moment, setMoment] = useState<Moment | null>(null);

  useEffect(() => {
    const show = setTimeout(() => setMoment(pickMoment()), SHOW_AFTER_MS);
    const rotate = setInterval(() => setMoment(pickMoment()), ROTATE_MS);
    return () => {
      clearTimeout(show);
      clearInterval(rotate);
    };
  }, []);

  if (!moment) return null;
  const Icon = ICONS[moment.icon];
  return (
    <div className="wb-moment" role="status" aria-live="off">
      <div className="wb-moment-card" key={moment.text}>
        <Icon className="wb-moment-icon" size={22} strokeWidth={2} aria-hidden />
        <span className="wb-moment-text">
          {moment.text}
          <span className="wb-moment-bar" aria-hidden>
            <span />
          </span>
        </span>
      </div>
    </div>
  );
}
