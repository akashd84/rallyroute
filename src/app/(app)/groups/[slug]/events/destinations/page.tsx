import Link from "next/link";
import { eventManagementContext } from "@/lib/events/management";
import { groupPath } from "@/lib/groups/paths";
import { AddressFields, EventForm } from "@/app/events/forms";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { group, destinations, manager, loadError } = await eventManagementContext(slug);
  const id = group.id;
  return <div className="mx-auto max-w-3xl p-6">
    <Link href={`${groupPath(group.slug)}/events`} className="inline-flex min-h-11 items-center underline">Events and destinations</Link>
    <h1 className="my-6 text-3xl">Manage destinations</h1>
    {loadError ? <p role="alert">Unable to load event settings. Reload before making changes.</p> : !manager ? <p>Group Owners and Admins can manage events and destinations.</p> : <>
          <h2 className="mt-8 text-2xl">Create destination</h2>
          <EventForm
            command="destination-save"
            values={{ groupId: id }}
            label="Save destination"
          >
            <AddressFields />
          </EventForm>
          <h2 className="mt-8 text-2xl">Manage destinations</h2>
          {destinations.data?.map((d) => (
            <details key={d.id} className="my-4 rounded border p-4">
              <summary>
                {d.name}
                {d.archived_at ? " (archived)" : ""}
              </summary>
              <p>
                {d.address_line_1}, {d.city}
              </p>
              {!d.location && (
                <p role="status">
                  Coordinates are not available yet. Edit and save this
                  destination to resolve it.
                </p>
              )}
              {d.geocoding_attribution && (
                <p className="text-sm text-muted-foreground">
                  {d.geocoding_attribution}
                </p>
              )}
              {!d.archived_at && (
                <>
                  <EventForm
                    command="destination-save"
                    values={{
                      groupId: id,
                      locationId: d.id,
                      revision: String(d.revision),
                    }}
                    label="Save destination"
                    confirmation="Address changes require households to reconfirm future rides."
                  >
                    <AddressFields
                      values={{
                        name: d.name,
                        addressLine1: d.address_line_1,
                        addressLine2: d.address_line_2,
                        city: d.city,
                        stateRegion: d.state_region,
                        postalCode: d.postal_code,
                        countryCode: d.country_code,
                      }}
                    />
                  </EventForm>
                  <EventForm
                    command="destination-archive"
                    values={{
                      groupId: id,
                      locationId: d.id,
                      revision: String(d.revision),
                    }}
                    label="Archive destination"
                    confirmation="Archive this destination? Historical events will retain it."
                  />
                </>
              )}
            </details>
          ))}
    </>}
  </div>;
}
