"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCodeInvitation } from "@/lib/invitations/generate";
import { invitationResult, invitationMessage } from "@/lib/invitations/result";
import { createClient } from "@/lib/supabase/server";
import { groupInviteCookie, groupTypes } from "@/lib/groups/constants";
import { inviteCookie, type HouseholdResult } from "@/lib/households/result";

const id = z.string().uuid();
const details = { name: z.string().trim().min(1).max(100), groupType: z.enum(groupTypes), description: z.string().trim().max(1000).default("") };
const uses = z.preprocess(value => value === "" ? undefined : typeof value === "string" ? Number(value) : value, z.number().int().positive().max(2147483647).optional());
const schema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), householdId: id, requestId: id, ...details }),
  z.object({ command: z.literal("settings"), groupId: id, ...details }),
  z.object({ command: z.literal("invite-direct"), groupId: id, email: z.string().trim().email().max(254) }),
  z.object({ command: z.literal("invite-link"), groupId: id, maxUses: uses }),
  z.object({ command: z.literal("revoke"), groupId: id, invitationId: id }),
  z.object({ command: z.literal("join"), householdId: id }),
  z.object({ command: z.literal("dismiss") }),
]);
function failed(code?: string, joining = false): HouseholdResult {
  if (joining) return { ok: false, message: "Unable to join with this invitation. Use the invited email and a household you own, or ask the Group Owner for a fresh link. Already joined? View your groups." };
  if (code === "42501") return { ok: false, message: "You do not have permission for this change. Reload to check your current access." };
  if (code === "22023" || code === "23514" || code === "P0001") return { ok: false, message: "Check the group details or invitation status, then try again." };
  return { ok: false, message: "Unable to save this change. Please try again." };
}
export async function groupAction(input: unknown): Promise<HouseholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the group name, type, email address, and household selection. Use a positive whole number for a link limit." };
  const value = parsed.data;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in before making this change.", destination: "/sign-in" };
    let error: { code?: string } | null = null;
    let destination: string | undefined;
    let invitationPath: string | undefined;
    let invitationCode: string | undefined;
    switch (value.command) {
      case "dismiss": (await cookies()).delete(groupInviteCookie); destination = "/groups"; break;
      case "create": {
        const result = await supabase.rpc("create_group_once", { p_household_id: value.householdId, p_name: value.name, p_group_type: value.groupType, p_description: value.description, p_request_id: value.requestId });
        error = result.error;
        if (!error && result.data) destination = `/groups/${result.data}`;
        break;
      }
      case "settings": {
        const result = await supabase.from("groups").update({ name: value.name, group_type: value.groupType, description: value.description || null }).eq("id", value.groupId).select("id");
        error = result.error;
        if (!error && !result.data?.length) return failed("42501");
        break;
      }
      case "invite-direct": case "invite-link": {
        const result = await createCodeInvitation(hash => supabase.rpc("create_group_invitation", {
          p_group_id: value.groupId, p_invite_type: value.command === "invite-direct" ? "direct" : "group_link",
          p_token_hash: hash,
          ...(value.command === "invite-direct" ? { p_invited_email: value.email } : value.maxUses ? { p_max_uses: value.maxUses } : {}),
        }));
        error = result.error;
        if (result.code) { invitationCode = result.code; invitationPath = `/join#g=${result.code}`; }
        break;
      }
      case "revoke": error = (await supabase.rpc("revoke_group_invitation", { p_group_id: value.groupId, p_invitation_id: value.invitationId })).error; break;
      case "join": {
        const store = await cookies();
        const hash = store.get(groupInviteCookie)?.value;
        if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { ok: false, message: "Enter your group invitation code or open the original link again to continue." };
        const result = await supabase.rpc("accept_invitation", { p_kind: "group", p_token_hash: hash, p_household_id: value.householdId });
        const outcome = invitationResult(result.data);
        if (result.error || outcome.status !== "ok" || outcome.destination_kind !== "group" || !outcome.destination_id) return { ok: false, message: result.error || outcome.status === "ok" ? "Unable to check this invitation. Please try again." : invitationMessage(outcome) };
        store.delete(groupInviteCookie); destination = `/groups/${outcome.destination_id}`;
        break;
      }
    }
    if (error) return failed(error.code, value.command === "join");
    revalidatePath("/account"); revalidatePath("/groups");
    if ("groupId" in value) revalidatePath(`/groups/${value.groupId}`);
    if ("householdId" in value) revalidatePath(`/households/${value.householdId}`);
    return { ok: true, message: "Saved.", destination, invitationPath, invitationCode };
  } catch { return failed(undefined, value.command === "join"); }
}
export async function captureGroupInvitation(hash: unknown): Promise<HouseholdResult> {
  if (!z.string().regex(/^[a-f0-9]{64}$/).safeParse(hash).success) return { ok: false, message: "Open a valid group invitation link." };
  try {
    const store = await cookies();
    const origin = (await headers()).get("origin");
    store.delete(inviteCookie);
    store.set(groupInviteCookie, hash as string, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 1800, secure: origin ? origin.startsWith("https://") : process.env.NODE_ENV === "production" });
    return { ok: true, message: "Invitation ready." };
  } catch { return { ok: false, message: "Unable to open this invitation. Open the original link again to retry." }; }
}
