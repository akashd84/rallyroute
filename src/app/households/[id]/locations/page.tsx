import Link from "next/link";
import { z } from "zod";
import { householdContext } from "@/lib/households/context";
import { AddressFields, EventForm } from "@/app/events/forms";
export const dynamic = "force-dynamic";
const locationSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  address_line_1: z.string().nullable(),
  address_line_2: z.string().nullable(),
  city: z.string().nullable(),
  state_region: z.string().nullable(),
  postal_code: z.string().nullable(),
  country_code: z.string(),
  revision: z.number(),
  archived_at: z.string().nullable(),
});
export default async function LocationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return <main>Household unavailable</main>;
  const context = await householdContext(id);
  if (!context.household) return <main>Household unavailable</main>;
  const { data, error } = await context.supabase.rpc(
    "household_location_list",
    { p_household_id: id },
  );
  const parsed = z.array(locationSchema).safeParse(data);
  const manager =
    context.access?.find((a) => a.user_id === context.user.id)?.role ===
      "owner" ||
    context.access?.find((a) => a.user_id === context.user.id)?.role ===
      "admin";
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link className="underline" href={`/households/${id}`}>
        Household
      </Link>
      <h1 className="my-6 text-3xl">Pickup and dropoff addresses</h1>
      <p>
        These manually entered addresses are private to your household. Map
        validation and routing are not available yet.
      </p>
      {(error || !parsed.success) && (
        <p role="alert">Unable to load addresses.</p>
      )}
      {parsed.success &&
        parsed.data.map((l) => (
          <section key={l.id} className="my-5 rounded border p-4">
            <h2>
              {l.label}
              {l.archived_at ? " (archived)" : ""}
            </h2>
            <p>
              {l.address_line_1}, {l.city}, {l.state_region} {l.postal_code}
            </p>
            {manager && !l.archived_at && (
              <>
                <EventForm
                  command="location-save"
                  values={{
                    householdId: id,
                    locationId: l.id,
                    revision: String(l.revision),
                  }}
                  label="Save address"
                  confirmation="Changing this address requires reconfirming affected future rides."
                >
                  <AddressFields
                    values={{
                      name: l.label,
                      addressLine1: l.address_line_1,
                      addressLine2: l.address_line_2,
                      city: l.city,
                      stateRegion: l.state_region,
                      postalCode: l.postal_code,
                      countryCode: l.country_code,
                    }}
                  />
                </EventForm>
                <EventForm
                  command="location-archive"
                  values={{
                    householdId: id,
                    locationId: l.id,
                    revision: String(l.revision),
                  }}
                  label="Archive address"
                  confirmation="Archive this address and disable its future ride preferences?"
                />
              </>
            )}
          </section>
        ))}
      {manager ? (
        <>
          <h2 className="mt-6 text-xl">Add address</h2>
          <EventForm
            command="location-save"
            values={{ householdId: id }}
            label="Save address"
          >
            <AddressFields />
          </EventForm>
        </>
      ) : (
        <p>
          Household Owners manage saved addresses. Members can select them for
          rides.
        </p>
      )}
    </main>
  );
}
