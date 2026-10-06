import Link from "next/link";

export function NavItem({ href, label, active, children }: {
  href: string; label: string; active: boolean; children: React.ReactNode;
}) {
  return <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}
    className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 rounded px-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "font-bold underline underline-offset-4" : "font-normal"}`}>
    {children}<span>{label}</span>
  </Link>;
}
