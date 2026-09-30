import { Apple, Monitor, Smartphone } from "lucide-react";

/** Which surfaces an account (or a person) has been seen on. */
export type Devices = { ios: boolean; android: boolean; web: boolean };

export default function DeviceIcons({ devices, size = 14 }: { devices: Devices; size?: number }) {
  const items = [
    devices.ios && { key: "ios", Icon: Apple, title: "iPhone app" },
    devices.android && { key: "android", Icon: Smartphone, title: "Android app" },
    devices.web && { key: "web", Icon: Monitor, title: "Web browser" },
  ].filter(Boolean) as { key: string; Icon: typeof Apple; title: string }[];
  if (items.length === 0) return <span className="ds-small">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[color:var(--ds-ink-2)]">
      {items.map(({ key, Icon, title }) => (
        <Icon key={key} size={size} strokeWidth={1.8} aria-label={title} />
      ))}
      <span className="sr-only">{items.map((i) => i.title).join(", ")}</span>
    </span>
  );
}
