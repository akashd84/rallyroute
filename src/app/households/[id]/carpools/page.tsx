import Link from "next/link";
import { z } from "zod";
import { householdContext } from "@/lib/households/context";
import { carpoolsSchema } from "@/lib/carpools/types";
export const dynamic = "force-dynamic";
export default async function CarpoolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <main>Household unavailable</main>;
  const { household, supabase } = await householdContext(id);
  if (!household) return <main>Household unavailable</main>;
  const result = await supabase.rpc("list_carpools", { p_household_id: id });
  const parsed = carpoolsSchema.safeParse(result.data);
  return <main className="mx-auto max-w-3xl p-6"><Link className="underline" href={`/households/${id}`}>Your household</Link>
    <h1 className="my-4 text-3xl">{household.display_name} carpools</h1>
    <Link className="underline" href={`/households/${id}/connections`}>Create a carpool from an accepted connection</Link>
    {result.error || !parsed.success ? <p role="alert">Carpools could not be loaded. Reload to check current arrangements.</p> : <>
      {!parsed.data.length && <p className="my-4">No carpools yet.</p>}
      {parsed.data.map(c => <section key={c.id} className="my-6 rounded border p-4"><h2 className="text-xl"><Link className="underline" href={`/households/${id}/carpools/${c.id}`}>{c.otherHouseholdName ?? "Connected household"} — {c.groupName}</Link></h2>
        <p>Status: {c.status}{c.status === "pending" ? c.incoming ? " — invitation awaiting your response" : " — awaiting the other household" : ""}</p>
        <p>{c.rides.filter(r => r.status === "confirmed").length} confirmed rides</p>
      </section>)}
    </>}
  </main>;
}
