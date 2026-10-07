"use client";

import { HouseholdSelector, type HeaderHousehold } from "./household-selector";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AppHeaderProps {
  households?: HeaderHousehold[];
  selectedHouseholdId?: string;
  householdsError?: boolean;
  title?: string;
  subtitle?: string;
  backHref?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function AppHeader({ title, subtitle, backHref, leading, trailing, households = [], selectedHouseholdId, householdsError }: AppHeaderProps) {
  const pathname = usePathname();
  const routeTitle = pathname === "/" ? "Home" : (pathname.startsWith("/groups") || pathname.startsWith("/group/")) ? "Groups" : pathname.startsWith("/households") ? "Household" : pathname === "/account" ? "Account" : pathname === "/calendar" ? "Calendar" : pathname === "/messages" ? "Messages" : "Profile";
  return <header className="sticky top-0 z-20 border-b bg-background pt-[env(safe-area-inset-top)]">
    <div className="mx-auto grid min-h-16 max-w-4xl grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
      <div className="flex min-w-0 items-center">
      {backHref && <Link href={backHref} aria-label="Go back" className="flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:outline-2"><ChevronLeft className="size-5" aria-hidden="true" /></Link>}
      {leading}
      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{title ?? routeTitle}</p>{subtitle && <p className="text-sm">{subtitle}</p>}</div>
      </div>
      <HouseholdSelector households={households} selectedId={selectedHouseholdId} loadError={householdsError} />
      <div className="flex min-w-0 items-center justify-end">{trailing}</div>
    </div>
  </header>;
}
