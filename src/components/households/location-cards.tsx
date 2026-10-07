import { PrimaryLocationForm } from "./primary-location-form";
import Link from "next/link";
import { householdLocations } from "@/lib/households/locations";
import { householdPath, locationEditPath } from "@/lib/households/paths";

export function AddressNotice() {
  return <p className="my-4 text-sm">These addresses are private to your household. Address details are sent to Geoapify for coordinate lookup. © OpenStreetMap contributors under the <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">Open Database License</a>.</p>;
}
export async function LocationCards({ householdSlug }: { householdSlug: string }) {
  const { household, locations, locationsError, manager } = await householdLocations(householdSlug);
  return <section aria-labelledby="saved-addresses" className="mt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="saved-addresses" className="text-2xl font-semibold">Saved addresses</h2>
      {manager && <Link href={`${householdPath(householdSlug)}/locations/add`} className="inline-flex min-h-11 items-center rounded-lg bg-teal-800 px-4 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2">Add address</Link>}
    </div>
    <AddressNotice />
    {locationsError ? <p role="alert">Unable to load addresses. Reload to try again.</p> : <>
      {!locations.length && <p className="mt-5">No saved locations yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{locations.map(l => <section key={l.id} className="flex min-w-0 flex-col rounded-xl border p-4">
        <h3 className="break-words text-lg font-semibold">{l.label}{l.archived_at ? " (archived)" : ""}</h3>
        {l.is_primary && !l.archived_at && <p className="mt-2 text-sm font-semibold text-teal-800">Primary address</p>}
        <address className="mt-2 break-words not-italic">
          {l.address_line_1 && <p>{l.address_line_1}</p>}{l.address_line_2 && <p>{l.address_line_2}</p>}
          {[l.city,l.state_region,l.postal_code].some(Boolean) && <p>{[l.city,l.state_region,l.postal_code].filter(Boolean).join(", ")}</p>}
          <p>{l.country_code}</p>
        </address>
        {l.coordinates_available === false && <p role="status">Coordinates are not available yet.</p>}
        {l.geocoding_attribution && <p className="text-sm">{l.geocoding_attribution}</p>}
        {manager && !l.archived_at && <footer className="mt-auto pt-4"><Link className="inline-flex min-h-11 items-center text-teal-800 underline focus-visible:outline-2 focus-visible:outline-offset-2" href={locationEditPath(householdSlug,l.slug)}>Edit address</Link>{!l.is_primary && <PrimaryLocationForm householdId={household.id} locationId={l.id} />}</footer>}
      </section>)}</div>
    </>}
    {!manager && <p className="mt-4">Household Owners manage saved addresses. Members can select them for rides.</p>}
  </section>;
}
