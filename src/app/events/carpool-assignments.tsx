import { householdPath } from "@/lib/households/paths";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { carpoolsSchema } from "@/lib/carpools/types";
import { displayTime } from "@/lib/events/time";
export async function CarpoolAssignments({ householdId, householdSlug, eventId }: { householdId: string; householdSlug: string; eventId: string }) {
  const client = await createClient();
  const result = await client.rpc("list_carpools", { p_household_id: householdId });
  const parsed = carpoolsSchema.safeParse(result.data);
  return <section aria-label="Confirmed carpool rides" className="my-6"><h2 className="text-xl">Confirmed carpool rides</h2>
    {result.error || !parsed.success ? <p role="alert">Carpool assignments could not be loaded. Reload to check arrangements.</p> : <>
      {parsed.data.flatMap(c => c.status==='accepted' ? c.rides.filter(r=>r.eventId===eventId && r.status==='confirmed').map(r => ({c,r})) : []).sort((a,b)=>Date.parse(a.r.anchorAt)-Date.parse(b.r.anchorAt)).map(({c,r}) => <div key={r.id} className="my-3">
        <Link className="underline" href={`${householdPath(householdSlug)}/carpools/${c.id}`}>{r.leg==='to_event'?'To event':'From event'} — {displayTime(r.anchorAt,r.timezone)}</Link>
        <p>Driver: {r.participants.find(p=>p.role==='driver')?.name}; riders: {r.participants.filter(p=>p.role==='rider').map(p=>p.name).join(', ')}</p>
      </div>)}
      {!parsed.data.some(c=>c.status==='accepted' && c.rides.some(r=>r.eventId===eventId && r.status==='confirmed')) && <p>No confirmed carpool rides for this household.</p>}
    </>}
  </section>;
}
