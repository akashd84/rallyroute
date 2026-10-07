"use server";
import { householdUrlForId } from "@/lib/households/urls";
import { householdLinkRecoveryPath } from "@/lib/households/paths";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCodeInvitation } from "@/lib/invitations/generate";
import { invitationResult, invitationMessage } from "@/lib/invitations/result";
import { createClient } from "@/lib/supabase/server";
import { groupInviteCookie } from "@/lib/groups/constants";
import { inviteCookie, type HouseholdResult } from "@/lib/households/result";

const name = z.string().trim().min(1).max(100);
const id = z.string().uuid();
const profile = { firstName: name, lastName: name };
const household = { householdId: id };
const schema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), ...profile, displayName: name, requestId: id }),
  z.object({ command: z.literal("accept"), ...profile }),
  z.object({ command: z.literal("dismiss") }),
  z.object({ command: z.literal("complete"), ...household, ...profile }),
  z.object({ command: z.literal("rename"), ...household, displayName: name }),
  z.object({ command: z.literal("participant"), ...household, participantId: id.optional(), firstName: name, lastName: z.string().trim().max(100).default(""), memberType: z.enum(["adult", "child"]) }),
  z.object({ command: z.literal("archive"), ...household, participantId: id }),
  z.object({ command: z.literal("invite"), ...household, email: z.string().trim().email().max(254), participantId: id.optional() }),
  z.object({ command: z.literal("revoke"), ...household, invitationId: id }),
  z.object({ command: z.literal("promote"), ...household, userId: id }),
  z.object({ command: z.literal("remove"), ...household, userId: id }),
  z.object({ command: z.literal("demote"), ...household }),
  z.object({ command: z.literal("leave"), ...household }),
]);
function failure(code?: string): HouseholdResult {
  if (code === "42501") return { ok: false, message: "You do not have permission for this change. Reload to check your current access." };
  if (code === "22023" || code === "23514") return { ok: false, message: "This change is no longer available. Check the invitation, participant, or remaining household Owners and try again." };
  return { ok: false, message: "Unable to save this change. Please try again." };
}
export async function householdAction(input: unknown): Promise<HouseholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the required names, email address, and selections." };
  const value = parsed.data;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in before making this change.", destination: "/sign-in" };
    let error: { code?: string } | null = null;
    let destination: string | undefined;
    let destinationHouseholdId: string | undefined;
    let invitationPath: string | undefined;
    let invitationCode: string | undefined;
    switch (value.command) {
      case "dismiss": {
        (await cookies()).delete(inviteCookie); destination = "/account"; break;
      }
      case "create": {
        const result = await supabase.rpc("onboard_household", { p_display_name: value.displayName, p_first_name: value.firstName, p_last_name: value.lastName, p_request_id: value.requestId });
        error = result.error;
        if (!error && result.data) destinationHouseholdId = result.data;
        break;
      }
      case "complete": {
        const result = await supabase.rpc("complete_household_onboarding", { p_household_id: value.householdId, p_first_name: value.firstName, p_last_name: value.lastName });
        error = result.error;
        if (!error && result.data) destinationHouseholdId = result.data;
        break;
      }
      case "accept": {
        const store = await cookies();
        const hash = store.get(inviteCookie)?.value;
        if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { ok: false, message: "Enter your invitation code or open the original link again to continue." };
        const result = await supabase.rpc("accept_invitation", { p_kind: "household", p_token_hash: hash, p_first_name: value.firstName, p_last_name: value.lastName });
        const outcome = invitationResult(result.data);
        if (result.error || outcome.status !== "ok" || outcome.destination_kind !== "household" || !outcome.destination_id) return { ok: false, message: result.error || outcome.status === "ok" ? "Unable to check this invitation. Please try again." : invitationMessage(outcome) };
        store.delete(inviteCookie); destinationHouseholdId = outcome.destination_id;
        break;
      }
      case "invite": {
        const result = await createCodeInvitation(hash => supabase.rpc("create_household_invitation", { p_household_id: value.householdId, p_email: value.email, p_token_hash: hash, ...(value.participantId ? { p_participant_id: value.participantId } : {}) }));
        error = result.error;
        if (result.code) { invitationCode = result.code; invitationPath = `/join#h=${result.code}`; }
        break;
      }
      case "rename": {
        const result = await supabase.from("households").update({ display_name: value.displayName }).eq("id", value.householdId).select("id");
        error = result.error;
        if (!error && !result.data?.length) return failure("42501");
        break;
      }
      case "participant": {
        const details = { first_name: value.firstName, last_name: value.lastName || null, member_type: value.memberType };
        const result = value.participantId
          ? await supabase.from("household_members").update(details).eq("id", value.participantId).eq("household_id", value.householdId).select("id")
          : await supabase.from("household_members").insert({ ...details, household_id: value.householdId }).select("id");
        error = result.error;
        if (!error && !result.data?.length) return failure("42501");
        break;
      }
      case "archive": error = (await supabase.rpc("archive_household_participant", { p_household_id: value.householdId, p_member_id: value.participantId })).error; break;
      case "revoke": error = (await supabase.rpc("revoke_household_invitation", { p_household_id: value.householdId, p_invitation_id: value.invitationId })).error; break;
      case "promote": error = (await supabase.rpc("promote_household_member", { p_household_id: value.householdId, p_user_id: value.userId })).error; break;
      case "remove": error = (await supabase.rpc("remove_household_member", { p_household_id: value.householdId, p_user_id: value.userId })).error; break;
      case "demote": error = (await supabase.rpc("demote_household_owner", { p_household_id: value.householdId })).error; break;
      case "leave": {
        error = (await supabase.rpc("leave_household", { p_household_id: value.householdId })).error;
        if (!error) destination = "/account";
        break;
      }
    }
    if (error?.code === "23514" && value.command === "participant") return { ok: false, message: "Account-linked participants must stay Adult. Remove future driving offers before changing another adult to Child." };
    if (error && value.command === "accept" && error.code === "22023") return { ok: false, message: "This invitation cannot be accepted. Sign in with the invited email, or ask the Owner for a fresh link." };
    if (error) return failure(error.code);
    if (destinationHouseholdId) destination = await householdUrlForId(supabase, destinationHouseholdId) ?? householdLinkRecoveryPath;
    if (!error && (value.command === "create" || value.command === "complete") && (await cookies()).get(groupInviteCookie)) destination = "/group-invitations/accept";
    revalidatePath("/account"); revalidatePath("/onboarding");
    revalidatePath("/households/[householdSlug]", "layout");
    return { ok: true, message: "Saved.", destination, invitationPath, invitationCode };
  } catch { return failure(); }
}

// Captures context before authentication; this never redeems or reveals invitation data.
export async function captureHouseholdInvitation(hash: unknown): Promise<HouseholdResult> {
  if (!z.string().regex(/^[a-f0-9]{64}$/).safeParse(hash).success) return { ok: false, message: "Open a valid invitation link." };
  try {
    const origin = (await headers()).get("origin");
    (await cookies()).delete(groupInviteCookie);
    (await cookies()).set(inviteCookie, hash as string, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 1800, secure: origin ? origin.startsWith("https://") : process.env.NODE_ENV === "production" });
    return { ok: true, message: "Invitation ready." };
  } catch { return { ok: false, message: "Unable to open this invitation. Open the original link again to retry." }; }
}
