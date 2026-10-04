import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function accountContext() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/sign-in");
  const { data: profile, error } = await supabase.from("profiles").select("id, first_name, last_name, onboarding_completed_at").eq("id", user.id).maybeSingle();
  return { supabase, user, profile, profileError: Boolean(error || !profile) };
}

export async function householdContext(id: string) {
  const context = await accountContext();
  const { data: household, error } = await context.supabase.from("households").select("id, display_name, archived_at").eq("id", id).is("archived_at", null).maybeSingle();
  if (error || !household) return { ...context, household: null, access: [], participants: [], invitations: [], loadError: true };
  const [access, participants, invitations] = await Promise.all([
    context.supabase.from("household_access").select("user_id, role, created_at").eq("household_id", id).order("created_at"),
    context.supabase.from("household_members").select("id, first_name, last_name, member_type, linked_user_id, archived_at").eq("household_id", id).is("archived_at", null).order("created_at"),
    context.supabase.from("household_invitations").select("id, invited_email, expires_at, revoked_at, consumed_at").eq("household_id", id).order("created_at", { ascending: false }),
  ]);
  return { ...context, household, access: access.data ?? [], participants: participants.data ?? [], invitations: invitations.data ?? [], loadError: Boolean(access.error || participants.error || invitations.error) };
}
