import { MobileAppShell } from "@/components/shell/mobile-app-shell";
import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!error && user) {
    return <MobileAppShell header={{ title: "Join" }}><JoinForm signedIn /></MobileAppShell>;
  }
  return <main><JoinForm signedIn={false} /></main>;
}
