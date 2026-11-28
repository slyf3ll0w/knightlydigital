import { Plus } from "lucide-react";
import { ChatFill, HomeFill, MoreFill, ScheduleFill } from "@/components/TabIcons";

export type MockTab = "Home" | "Schedule" | "Chat" | "Menu";

/**
 * The phone app's bottom bar as the site's phone pictures draw it: the
 * docked iOS bar from components/AppShell.tsx (MobileTabBar), edge to edge,
 * frosted, Home · Schedule · Create · Chat · Menu, the selected tab in the
 * brand color. Styles: `.tabbar-mock` in app/ds-tabbar.css, next to the
 * app's own. Change the app's bar and this together.
 */
export default function PhoneTabBarMock({ on, safeArea = 28, zIndex }: { on?: MockTab | null; safeArea?: number; /** under a sheet or the home indicator drawn by the frame */ zIndex?: number }) {
  const tab = (label: MockTab, Icon: typeof HomeFill) => (
    <span className={`tabbar-tab ${label === on ? "is-on" : ""}`}>
      <Icon size={24} />
      {label}
    </span>
  );
  return (
    <nav className="tabbar-mock" aria-hidden style={{ ["--tabbar-mock-safe" as string]: `${safeArea}px`, ...(zIndex !== undefined ? { zIndex } : {}) }}>
      <div className="tabbar-dock-row">
        {tab("Home", HomeFill)}
        {tab("Schedule", ScheduleFill)}
        <span className="tabbar-slot">
          <span className="tabbar-create">
            <Plus size={24} strokeWidth={2.6} />
          </span>
        </span>
        {tab("Chat", ChatFill)}
        {tab("Menu", MoreFill)}
      </div>
    </nav>
  );
}
