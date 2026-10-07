import Link from "next/link";
import { notFound } from "next/navigation";
import { householdLocations, isLocationSlug } from "@/lib/households/locations";
import { householdPath } from "@/lib/households/paths";
import { AddressFields, EventForm } from "@/app/events/forms";
import { AddressNotice } from "@/components/households/location-cards";
export const dynamic = "force-dynamic";
export default async function EditAddressPage({ params }: { params: Promise<{ householdSlug: string; locationSlug: string }> }) {
  const { householdSlug, locationSlug } = await params;
  const context = await householdLocations(householdSlug);
  if (!isLocationSlug(locationSlug) || !context.manager || context.locationsError) notFound();
  const location = context.locations.find(l => l.slug === locationSlug && !l.archived_at);
  if (!location) notFound();
  return <div className="mx-auto max-w-3xl p-6">
    <Link className="inline-flex min-h-11 items-center underline" href={`${householdPath(householdSlug)}/locations`}>Saved addresses</Link>
    <h1 className="my-6 text-3xl font-semibold">Edit address</h1>
    <AddressNotice />
    <EventForm key={`${location.id}:${location.revision}`} command="location-save" values={{ householdId: context.household.id, locationId: location.id, revision: String(location.revision) }} label="Save address" confirmation="Changing this address requires reconfirming affected future rides.">
      <AddressFields values={{ name: location.label, addressLine1: location.address_line_1, addressLine2: location.address_line_2, city: location.city, stateRegion: location.state_region, postalCode: location.postal_code, countryCode: location.country_code }} />
    </EventForm>
  </div>;
}
