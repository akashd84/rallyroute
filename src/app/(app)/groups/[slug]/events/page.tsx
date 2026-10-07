import Link from "next/link";
import { groupContext } from "@/lib/groups/context";
import { groupPath } from "@/lib/groups/paths";
import { EventCalendar } from "@/components/groups/event-calendar";
export const dynamic = "force-dynamic";
export default async function EventsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string; view?: string; focus?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const { supabase,user,group } = await groupContext(slug);
  const admins = await supabase.from("group_admins").select("role").eq("group_id",group.id).eq("user_id",user.id);
  const manager = admins.data?.some(admin=>admin.role==="owner"||admin.role==="admin");
  const base = `${groupPath(group.slug)}/events`;
  return <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
    <Link href={groupPath(group.slug)} className="inline-flex min-h-11 items-center underline">{group.name}</Link>
    <h1 className="my-6 text-3xl">Events and destinations</h1>
    {admins.error && <p role="alert">Event management access could not be loaded. Reload to try again.</p>}
    {manager && <nav aria-label="Event management" className="flex flex-wrap gap-3">
      <Link href={`${base}/new`} className="inline-flex min-h-11 items-center underline">Create Event</Link>
      <Link href={`${base}/series/new`} className="inline-flex min-h-11 items-center underline">Create Series</Link>
      <Link href={`${base}/destinations`} className="inline-flex min-h-11 items-center underline">Manage Destinations</Link>
    </nav>}
    <EventCalendar slug={group.slug} date={query.date} view={query.view} focus={query.focus} />
  </div>;
}
