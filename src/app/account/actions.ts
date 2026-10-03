"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthResult } from "@/lib/auth/result";

export async function signOut(): Promise<AuthResult> {
  let unconfirmed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    // The SDK removes local cookies even when remote revocation fails.
    // Cookie changes rerender this protected page; carry the notice to sign-in.
    unconfirmed = Boolean(error);
  } catch {
    return { ok: false, message: "Could not confirm sign-out. Reload or try again." };
  }
  redirect(unconfirmed ? "/sign-in?error=sign-out" : "/sign-in");
}
