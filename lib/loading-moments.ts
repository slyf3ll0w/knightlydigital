/**
 * The "loading moment": one short trade-flavored line and a matching tool
 * icon, picked at random every time a page skeleton stays on screen long
 * enough to notice (components/LoadingMoment.tsx). The point is that no two
 * waits look the same, so a 400 ms round trip reads as the app doing
 * something rather than the app being stuck (David 2026-11-04: "a cool
 * loading screen with some uniqueness every time").
 *
 * Icon names are lucide-react exports; LoadingMoment maps them to the
 * components explicitly so the bundle only carries these few. Keep lines
 * short enough for a phone (scripts/test-loading-moments.ts caps them) and
 * in the voice of a tech on a job, never a computer ("Loading...").
 */
export type Moment = { icon: MomentIcon; text: string };

export const MOMENT_ICONS = [
  "Anvil", "Axe", "Battery", "BatteryCharging", "Bolt", "Boxes", "Brush", "Calculator", "Car",
  "Clipboard", "ClipboardList", "Coffee", "Cog", "Compass", "Drill", "Droplets", "Fan", "Flame",
  "Flashlight", "Footprints", "Gauge", "Hammer", "HardHat", "Hourglass", "Key", "Lightbulb", "Magnet",
  "MapPin", "Nut", "Package", "Paintbrush", "PaintRoller", "PencilRuler", "Phone", "Pickaxe", "Plug",
  "Receipt", "Route", "Ruler", "Scissors", "Shovel", "Snowflake", "Sparkles", "Sun", "Sunrise", "Thermometer",
  "Timer", "Tractor", "Truck", "Waves", "Wind", "Wrench", "Zap",
] as const;
export type MomentIcon = (typeof MOMENT_ICONS)[number];

export const MOMENTS: readonly Moment[] = [
  { icon: "Ruler", text: "Measuring twice" },
  { icon: "Hammer", text: "Finding the hammer" },
  { icon: "Drill", text: "Charging the drill battery" },
  { icon: "Wrench", text: "Looking for the 10 mm socket" },
  { icon: "Truck", text: "Backing the truck in" },
  { icon: "HardHat", text: "Hard hats on" },
  { icon: "Flashlight", text: "Checking under the sink" },
  { icon: "Coffee", text: "Topping off the coffee" },
  { icon: "PaintRoller", text: "One more coat" },
  { icon: "ClipboardList", text: "Reading the work order" },
  { icon: "Key", text: "Finding the right key" },
  { icon: "Lightbulb", text: "Flipping the breaker back on" },
  { icon: "Plug", text: "Plugging it in" },
  { icon: "Thermometer", text: "Checking the thermostat" },
  { icon: "Droplets", text: "Tightening the fitting" },
  { icon: "Fan", text: "Spinning up the blower" },
  { icon: "MapPin", text: "Pulling up the address" },
  { icon: "Route", text: "Mapping the route" },
  { icon: "Calculator", text: "Running the numbers" },
  { icon: "Receipt", text: "Adding up the invoice" },
  { icon: "Phone", text: "Calling the client back" },
  { icon: "Cog", text: "Turning the gears" },
  { icon: "Nut", text: "Chasing the nut that rolled away" },
  { icon: "Magnet", text: "Fishing the screw out" },
  { icon: "Scissors", text: "Cutting to length" },
  { icon: "Shovel", text: "Breaking ground" },
  { icon: "Pickaxe", text: "Digging in" },
  { icon: "Sunrise", text: "Early start" },
  { icon: "Compass", text: "Getting our bearings" },
  { icon: "Zap", text: "Checking for voltage" },
  { icon: "Brush", text: "Sweeping up" },
  { icon: "Anvil", text: "Hammering it out" },
  { icon: "Bolt", text: "Tightening the last bolt" },
  { icon: "PencilRuler", text: "Sketching it out" },
  { icon: "Gauge", text: "Checking the pressure" },
  { icon: "BatteryCharging", text: "Charging up" },
  { icon: "Hourglass", text: "Almost there" },
  { icon: "Wind", text: "Clearing the vents" },
  { icon: "Waves", text: "Priming the pump" },
  { icon: "Snowflake", text: "Topping off the refrigerant" },
  { icon: "Flame", text: "Lighting the pilot" },
  { icon: "Sun", text: "Beating the heat" },
  { icon: "Timer", text: "On the clock" },
  { icon: "Package", text: "Unloading the parts" },
  { icon: "Boxes", text: "Stacking the supplies" },
  { icon: "Tractor", text: "Firing up the mower" },
  { icon: "Car", text: "Packing the van" },
  { icon: "Footprints", text: "Wiping our boots" },
  { icon: "Sparkles", text: "Polishing it up" },
  { icon: "Axe", text: "Splitting the difference" },
  { icon: "Paintbrush", text: "Cutting in the edges" },
  { icon: "Battery", text: "Swapping the battery" },
  { icon: "Clipboard", text: "Checking the list" },
];

/** Longest line we let on screen: fits a 320 px phone beside the icon. */
export const MOMENT_MAX_CHARS = 32;

let last = -1;

/**
 * A random moment, never the one shown last (so a rotation always changes
 * and two back-to-back waits never repeat). `random` is injectable for tests.
 */
export function pickMoment(random: () => number = Math.random): Moment {
  const n = MOMENTS.length;
  let i = Math.floor(random() * n) % n;
  if (i === last) i = (i + 1) % n;
  last = i;
  return MOMENTS[i];
}
