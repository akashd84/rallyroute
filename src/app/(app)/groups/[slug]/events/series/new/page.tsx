import Link from "next/link";
import { randomUUID } from "node:crypto";
import { eventManagementContext } from "@/lib/events/management";
import { groupPath } from "@/lib/groups/paths";
import { SeriesForm } from "@/app/events/series-form";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { group, destinations, manager, loadError } = await eventManagementContext(slug);
  const id = group.id;
  return <div className="mx-auto max-w-3xl p-6">
    <Link href={`${groupPath(group.slug)}/events`} className="inline-flex min-h-11 items-center underline">Events and destinations</Link>
    <h1 className="my-6 text-3xl">Create recurring events</h1>
    {loadError ? <p role="alert">Unable to load event settings. Reload before making changes.</p> : !manager ? <p>Group Owners and Admins can manage events and destinations.</p> : <>
          <SeriesForm
            groupId={id}
            requestId={randomUUID()}
            destinations={
              destinations.data?.filter((d) => !d.archived_at) ?? []
            }
          />
    </>}
  </div>;
}
