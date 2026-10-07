import Link from "next/link";
import { householdContext } from "@/lib/households/context";
import { householdPath } from "@/lib/households/paths";
import { LocationCards } from "@/components/households/location-cards";
export const dynamic = "force-dynamic";
export default async function LocationsPage({ params }: { params: Promise<{ householdSlug: string }> }) {
  const { householdSlug } = await params;
  await householdContext(householdSlug);
  return <div className="mx-auto max-w-3xl p-6">
    <Link className="underline" href={householdPath(householdSlug)}>Household</Link>
    <h1 className="my-6 text-3xl">Pickup and dropoff addresses</h1>
    <LocationCards householdSlug={householdSlug} />
  </div>;
}
