"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "./nav-item";

// Provisional information architecture, pending UX testing.
const destinations = [
  { href: "/", label: "Home", path: "m3 10 9-7 9 7v11h-6v-7H9v7H3Z" },
  { href: "/groups", label: "Groups", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-4 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 3a4 4 0 0 1 0 8" },
  { href: "/calendar", label: "Calendar", path: "M3 5h18v16H3Z M16 3v4 M8 3v4 M3 11h18 M8 15h2 M14 15h2" },
  { href: "/messages", label: "Messages", path: "M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" },
  { href: "/profile", label: "Profile", path: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2 M12 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
];

export function BottomNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <div className="mx-auto grid max-w-4xl grid-cols-5 gap-1 px-2 py-1">
      {destinations.map(item => <NavItem key={item.href} href={item.href} label={item.label}
        active={item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg>
      </NavItem>)}
    </div>
  </nav>;
}
