import { accountContext } from "@/lib/households/context";
export async function eligibleHouseholds(context: Awaited<ReturnType<typeof accountContext>>) {
  const [houses, roles] = await Promise.all([
    context.supabase.from("households").select("id, display_name").is("archived_at", null).order("created_at"),
    context.supabase.from("household_access").select("household_id, role").eq("user_id", context.user.id),
  ]);
  return { households: houses.data?.filter(h => roles.data?.some(a => a.household_id === h.id && (a.role === "owner" || a.role === "admin"))) ?? [], error: Boolean(houses.error || roles.error) };
}
