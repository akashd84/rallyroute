import { AppHeader, type AppHeaderProps } from "./app-header";
import { AppMain } from "./app-main";
import { BottomNavigation } from "./bottom-navigation";

// No transforms or overflow clipping: feature overlays can use ordinary portals.
export function MobileAppShell({ children, header, fullWidth = false }: {
  children: React.ReactNode;
  header?: AppHeaderProps | null;
  fullWidth?: boolean;
}) {
  return <div className="flex min-h-dvh flex-col">
    <a href="#app-main" className="fixed left-4 top-4 z-50 -translate-y-24 bg-background p-3 focus:translate-y-0 focus-visible:outline-2">Skip to content</a>
    {header !== null && <AppHeader {...header} />}
    <AppMain fullWidth={fullWidth}>{children}</AppMain>
    <BottomNavigation />
  </div>;
}
