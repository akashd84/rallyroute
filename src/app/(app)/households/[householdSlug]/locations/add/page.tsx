import Link from "next/link";
import { notFound } from "next/navigation";
import { householdContext } from "@/lib/households/context";
import { householdPath } from "@/lib/households/paths";
import { AddressFields, EventForm } from "@/app/events/forms";
import { AddressNotice } from "@/components/households/location-cards";
export const dynamic = "force-dynamic";
export default async function AddAddressPage({ params }: { params: Promise<{ householdSlug: string }> }) {
  const { householdSlug } = await params;
  const { household, access, user } = await householdContext(householdSlug);
  if (!access.some(a => a.user_id === user.id && ["owner","admin"].includes(a.role))) notFound();
  return <div className="mx-auto max-w-3xl p-6">
    <Link className="inline-flex min-h-11 items-center underline" href={`${householdPath(householdSlug)}/locations`}>Saved addresses</Link>
    <h1 className="my-6 text-3xl font-semibold">Add address</h1>
    <AddressNotice />
    <EventForm command="location-save" values={{ householdId: household.id }} label="Save address"><AddressFields /></EventForm>
  </div>;
}
