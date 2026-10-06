import { accountContext } from "@/lib/households/context";
import { MobileAppShell } from "@/components/shell/mobile-app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await accountContext();
  return <MobileAppShell>{children}</MobileAppShell>;
}
