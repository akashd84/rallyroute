"use server";
import { householdUrlForId } from "@/lib/households/urls";
import { householdLinkRecoveryPath } from "@/lib/households/paths";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HouseholdResult } from "@/lib/households/result";
import { decodeConnectionProof } from "./proof";
import { outcomeSchema, phoneSchema } from "./types";
const id = z.string().uuid();
const base = { householdId: id, connectionId: id };
const schema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("request"), householdId: id, proof: z.string().min(1).max(4096), phone: phoneSchema, consent: z.literal("yes") }),
  z.object({ command: z.literal("accept"), ...base, revision: z.coerce.number().int().positive(), phone: phoneSchema, consent: z.literal("yes") }),
  z.object({ command: z.enum(["decline", "withdraw", "disconnect"]), ...base, revision: z.coerce.number().int().positive() }),
  z.object({ command: z.literal("contact"), ...base, phone: phoneSchema, consent: z.literal("yes") }),
  z.object({ command: z.literal("share"), ...base, locationId: id, locationRevision: z.coerce.number().int().positive(), eventId: id, eventRevision: z.coerce.number().int().positive(), leg: z.enum(["to_event", "from_event"]), consent: z.literal("yes") }),
  z.object({ command: z.literal("revoke"), ...base, shareId: id }),
]);
export async function connectionAction(input: unknown): Promise<HouseholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the selections, phone number, and sharing confirmation." };
  const value = parsed.data;
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return { ok: false, message: "Sign in before managing connections.", destination: "/sign-in" };
    let result;
    if (value.command === "request") {
      let proof;
      try { proof = decodeConnectionProof(value.proof, auth.data.user.id, value.householdId); }
      catch { return { ok: false, message: "This suggestion expired or changed. Find matches again." }; }
      result = await createAdminClient().rpc("request_connection", {
        p_user_id: proof.user, p_household_id: proof.household, p_other_household_id: proof.other,
        p_event_id: proof.event, p_leg: proof.leg, p_pair_key: proof.pair, p_fingerprint: proof.fingerprint,
        p_max_distance: proof.distance, p_phone: value.phone,
      });
    } else result = await client.rpc("connection_action", { p_command: value.command, p_data: value });
    const parsedOutcome = outcomeSchema.safeParse(result.data);
    if (result.error || !parsedOutcome.success) return { ok: false, message: "Unable to save this connection. Reload and try again." };
    const outcome = parsedOutcome.data;
    if (outcome.status === "stale") return { ok: false, message: "This suggestion expired or changed. Find matches again." };
    if (outcome.status !== "ok" && outcome.status !== "existing") return { ok: false, message: "This connection or sharing selection is no longer available. Reload to check its current status." };
    revalidatePath("/account");
    revalidatePath("/households/[householdSlug]/connections", "page");
    const url = value.command === "request" ? await householdUrlForId(client, value.householdId) : null;
    return { ok: true, message: outcome.status === "existing" ? outcome.incoming ? "An incoming request already exists. Open Connections to accept or decline it." : "A connection or outgoing request already exists." : "Saved.",
      ...(value.command === "request" ? { destination: url ? `${url}/connections` : householdLinkRecoveryPath } : {}) };
  } catch { return { ok: false, message: "Unable to save this connection. Reload and try again." }; }
}
