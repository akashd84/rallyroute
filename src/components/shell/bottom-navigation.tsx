"use client";

import { CalendarDays, House, MessageSquare, User, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { NavItem } from "./nav-item";

// Provisional information architecture, pending UX testing.
const destinations = [
  { href: "/", label: "Home", icon: House },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <div className="mx-auto grid max-w-4xl grid-cols-5 gap-1 px-2 py-1">
      {destinations.map(item => <NavItem key={item.href} href={item.href} label={item.label}
        active={item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === "/groups" && pathname.startsWith("/group/"))}>
        <item.icon className="size-5" aria-hidden="true" />
      </NavItem>)}
    </div>
  </nav>;
}
