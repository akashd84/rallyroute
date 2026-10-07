import { cache } from "react";
import { notFound } from "next/navigation";
import { isGroupSlug } from "./paths";
import { accountContext } from "@/lib/households/context";
export async function eligibleHouseholds(context: Awaited<ReturnType<typeof accountContext>>) {
  const [houses, roles] = await Promise.all([
    context.supabase.from("households").select("id, display_name").is("archived_at", null).order("created_at"),
    context.supabase.from("household_access").select("household_id, role").eq("user_id", context.user.id),
  ]);
  return { households: houses.data?.filter(h => roles.data?.some(a => a.household_id === h.id && (a.role === "owner" || a.role === "admin"))) ?? [], error: Boolean(houses.error || roles.error) };
}

// Request-local cache shares the route boundary lookup with nested pages/layouts.
export const groupContext = cache(async (slug: string) => {
  const context = await accountContext();
  if (!isGroupSlug(slug)) notFound();
  const { data: group, error } = await context.supabase.from("groups")
    .select("id, slug, name, group_type, description").eq("slug", slug).maybeSingle();
  if (context.profileError || error || !group) notFound();
  return { ...context, group };
});
