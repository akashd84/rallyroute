import "server-only";
import { groupContext } from "@/lib/groups/context";
export async function eventManagementContext(slug: string) {
  const context = await groupContext(slug);
  const [admins,destinations] = await Promise.all([
    context.supabase.from("group_admins").select("role").eq("group_id",context.group.id).eq("user_id",context.user.id),
    context.supabase.from("event_locations").select("*").eq("group_id",context.group.id).order("name"),
  ]);
  return { ...context, destinations, manager: admins.data?.some(admin=>admin.role==="owner"||admin.role==="admin"), loadError: Boolean(admins.error||destinations.error) };
}
