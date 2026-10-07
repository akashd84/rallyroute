"use server";
import { householdUrlForId } from "@/lib/households/urls";
import { householdLinkRecoveryPath } from "@/lib/households/paths";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localInstant } from "@/lib/events/time";
import type { HouseholdResult } from "@/lib/households/result";
import { carpoolCommandSchema, carpoolOutcomeSchema } from "./types";

export async function carpoolAction(input: unknown): Promise<HouseholdResult> {
  const parsed = carpoolCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the selections, time, seats, and sharing confirmation." };
  const value = parsed.data;
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return { ok: false, message: "Sign in before managing carpools.", destination: "/sign-in" };
    let anchorAt: string | undefined;
    if (value.command === "propose" || value.command === "time") {
      // The submitted timezone is never authoritative: resolve it through this account's event access.
      const eventId = value.command === "propose" ? value.eventId : undefined;
      let trustedEvent = eventId;
      if (!trustedEvent && value.command === "time") {
        const detail = await client.rpc("get_carpool", { p_household_id: value.householdId, p_carpool_id: value.carpoolId });
        const { carpoolSchema } = await import("./types");
        const pool = carpoolSchema.safeParse(detail.data);
        if (detail.error || !pool.success) return { ok: false, message: "Carpool unavailable. Reload." };
        trustedEvent = pool.data.rides.find(r => r.id === value.rideId)?.eventId;
      }
      if (!trustedEvent) return { ok: false, message: "Ride unavailable. Reload." };
      const event = await client.from("events").select("timezone").eq("id", trustedEvent).maybeSingle();
      if (event.error || !event.data || event.data.timezone !== value.timezone) return { ok: false, message: "The event timezone changed. Reload and review the time." };
      try { const [date, time] = value.localTime.split("T"); anchorAt = localInstant(date, time, event.data.timezone); }
      catch { return { ok: false, message: "Enter a valid, unambiguous time in the event timezone." }; }
    }
    const result = await client.rpc("carpool_action", { p_command: value.command, p_data: { ...value, ...(anchorAt ? { anchorAt } : {}) } });
    const outcome = carpoolOutcomeSchema.safeParse(result.data);
    if (result.error || !outcome.success) return { ok: false, message: "Unable to save this carpool. Reload and try again." };
    const status = outcome.data.status;
    if (status === "assignment_conflict") return { ok: false, message: "A participant already has a confirmed ride for this event and direction. Review their arrangements." };
    if (status === "invalid_ride") return { ok: false, message: "Review attendance, the adult driver, participants, and available seats before approving." };
    if (status !== "ok" && status !== "existing") return { ok: false, message: "This arrangement changed or is unavailable. Reload, review the details, and try again." };
    revalidatePath("/account");
    revalidatePath("/households/[householdSlug]/carpools", "page");
    revalidatePath("/households/[householdSlug]/carpools/[carpoolId]", "page");
    const url = value.command === "create" ? await householdUrlForId(client, value.householdId) : null;
    revalidatePath("/groups/[slug]/[eventSlug]", "page");
    return { ok: true, message: status === "existing" ? "An arrangement already exists. Review it below." : "Saved.",
      ...(value.command === "create" && outcome.data.id ? { destination: url ? `${url}/carpools/${outcome.data.id}` : householdLinkRecoveryPath } : {}) };
  } catch { return { ok: false, message: "Unable to save this carpool. Reload and try again." }; }
}
