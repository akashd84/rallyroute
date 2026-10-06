"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  backHref?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function AppHeader({ title, subtitle, backHref, leading, trailing }: AppHeaderProps) {
  const pathname = usePathname();
  const routeTitle = pathname === "/" ? "Home" : pathname.startsWith("/groups") ? "Groups" : pathname.startsWith("/households") ? "Household" : pathname === "/account" ? "Account" : pathname === "/calendar" ? "Calendar" : pathname === "/messages" ? "Messages" : "Profile";
  return <header className="sticky top-0 z-20 border-b bg-background pt-[env(safe-area-inset-top)]">
    <div className="mx-auto flex min-h-16 max-w-4xl items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
      {backHref && <Link href={backHref} aria-label="Go back" className="flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:outline-2">←</Link>}
      {leading}
      <div className="min-w-0 flex-1"><p className="font-semibold">{title ?? routeTitle}</p>{subtitle && <p className="text-sm">{subtitle}</p>}</div>
      {trailing}
    </div>
  </header>;
}
