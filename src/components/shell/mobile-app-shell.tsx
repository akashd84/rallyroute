import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { householdSelectionCookie, selectedHousehold } from "@/lib/households/selection";
import { SignOutForm } from "@/app/account/sign-out-form";
import { AppHeader, type AppHeaderProps } from "./app-header";
import { AppMain } from "./app-main";
import { BottomNavigation } from "./bottom-navigation";

// No transforms or overflow clipping: feature overlays can use ordinary portals.
export async function MobileAppShell({ children, header, fullWidth = false }: {
  children: React.ReactNode;
  header?: AppHeaderProps | null;
  fullWidth?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = header === null ? { data: [], error: null } : await supabase.from("households")
    .select("id, display_name").is("archived_at", null).order("created_at").order("id");
  const households = data ?? [];
  const savedId = (await cookies()).get(householdSelectionCookie)?.value;
  const selectedId = selectedHousehold(households, savedId)?.id;
  return <div className="flex min-h-dvh flex-col">
    <a href="#app-main" className="fixed left-4 top-4 z-50 -translate-y-24 bg-background p-3 focus:translate-y-0 focus-visible:outline-2">Skip to content</a>
    {header !== null && <AppHeader {...header} households={households} selectedHouseholdId={selectedId} householdsError={Boolean(error)} trailing={<>{header?.trailing}<SignOutForm compact /></>} />}
    <AppMain fullWidth={fullWidth}>{children}</AppMain>
    <BottomNavigation />
  </div>;
}
